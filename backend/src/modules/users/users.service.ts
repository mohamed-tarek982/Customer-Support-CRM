import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ADMIN_ROLE, USER_ERROR_CODES, USERS_PAGE_SIZE, type UserRole } from './users.constants';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { ListUsersQueryDto } from './dto/list-users-query.dto';

/** The API shape for a user. Never carries `passwordHash`. */
export interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  role: string;
  branchId: string | null;
  departmentId: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedUsers {
  items: UserResponse[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The columns every read returns.
 *
 * An explicit `select` rather than a full row with `passwordHash` deleted on the
 * way out: a column added to the model later is then invisible to the API by
 * default, instead of leaking the moment someone adds a sensitive field.
 */
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  branchId: true,
  departmentId: true,
  isActive: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type SelectedUser = Pick<User, keyof typeof USER_SELECT>;

/** Prisma's unique-constraint violation. Raised here by the email index. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

/**
 * Staff account administration (SCRUM-34).
 *
 * Two invariants live here rather than in the controller, because they have to
 * hold for every caller and not only for the ones that arrived over HTTP:
 *
 *   1. An admin cannot deactivate their own account. Doing so ends their session
 *      mid-request and leaves the actor unable to undo it.
 *   2. The last active admin can neither be deactivated nor demoted. Without
 *      this, one request locks every human out of user management and the only
 *      way back in is a database console.
 *
 * Both are checked inside the same transaction as the write they protect, so two
 * admins demoting each other at the same moment cannot both pass the check and
 * leave the installation with zero admins.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async list(query: ListUsersQueryDto): Promise<PaginatedUsers> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? USERS_PAGE_SIZE;

    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: rows.map(toResponse), total, page, pageSize };
  }

  async get(id: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return toResponse(user);
  }

  /**
   * Create a staff account.
   *
   * The duplicate-email check is the unique index, not a pre-flight lookup: a
   * read-then-write races two admins creating the same address, and the index is
   * the only thing that cannot be raced. `CreateUserDto` lower-cases the address
   * first, which is what makes the index behave case-insensitively.
   */
  async create(dto: CreateUserDto): Promise<UserResponse> {
    await this.assertTenantRefsExist(dto.branchId, dto.departmentId);

    const passwordHash = await this.auth.hashPassword(dto.password);

    try {
      const created = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          role: dto.role,
          passwordHash,
          branchId: dto.branchId ?? null,
          departmentId: dto.departmentId ?? null,
        },
        select: USER_SELECT,
      });

      this.logger.log(`Created user ${created.id} with role ${created.role}`);
      return toResponse(created);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(USER_ERROR_CODES.emailTaken);
      }
      throw error;
    }
  }

  /**
   * Update profile fields, and optionally the role.
   *
   * A role change here takes the same last-admin path as `assignRole`, so the
   * invariant cannot be side-stepped by sending a role to the edit endpoint
   * instead of the dedicated one.
   */
  async update(id: string, dto: UpdateUserDto): Promise<UserResponse> {
    const existing = await this.prisma.user.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    await this.assertTenantRefsExist(dto.branchId, dto.departmentId);

    const demotingAnAdmin =
      dto.role !== undefined && existing.role === ADMIN_ROLE && dto.role !== ADMIN_ROLE;

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (demotingAnAdmin) {
          await assertAnotherActiveAdminExists(tx, id);
        }

        const updated = await tx.user.update({
          where: { id },
          data: {
            ...(dto.email === undefined ? {} : { email: dto.email }),
            ...(dto.name === undefined ? {} : { name: dto.name }),
            ...(dto.role === undefined ? {} : { role: dto.role }),
            ...(dto.branchId === undefined ? {} : { branchId: dto.branchId }),
            ...(dto.departmentId === undefined ? {} : { departmentId: dto.departmentId }),
          },
          select: USER_SELECT,
        });

        return toResponse(updated);
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(USER_ERROR_CODES.emailTaken);
      }
      throw error;
    }
  }

  /**
   * Soft-disable an account.
   *
   * Revoking the refresh tokens is the load-bearing half. Flipping `isActive`
   * alone stops new logins, but a deactivated user holding a live refresh token
   * keeps minting access tokens until it expires. Both writes share one
   * transaction, so an account is never disabled with its sessions left alive.
   */
  async deactivate(id: string, actorId: string): Promise<UserResponse> {
    if (id === actorId) {
      throw new ConflictException(USER_ERROR_CODES.cannotDeactivateSelf);
    }

    const existing = await this.prisma.user.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    // Idempotent: disabling an already-disabled account is not a failure, and
    // re-stamping `deactivatedAt` would lose when it actually happened.
    if (!existing.isActive) {
      return this.get(id);
    }

    return this.prisma.$transaction(async (tx) => {
      if (existing.role === ADMIN_ROLE) {
        await assertAnotherActiveAdminExists(tx, id);
      }

      const updated = await tx.user.update({
        where: { id },
        data: { isActive: false, deactivatedAt: new Date(), deactivatedById: actorId },
        select: USER_SELECT,
      });

      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      this.logger.log(`User ${id} deactivated by ${actorId}; refresh tokens revoked`);
      return toResponse(updated);
    });
  }

  /** Re-enable an account, clearing both deactivation fields together so the
   * pair never describes a half-state. */
  async reactivate(id: string): Promise<UserResponse> {
    const existing = await this.prisma.user.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: true, deactivatedAt: null, deactivatedById: null },
      select: USER_SELECT,
    });

    return toResponse(updated);
  }

  /**
   * Assign a role.
   *
   * `RolesGuard` already keeps non-admins out of the endpoint. The check here is
   * the other half: an admin demoting the only remaining admin, themselves
   * included, would leave nobody able to promote anyone back.
   */
  async assignRole(id: string, role: UserRole): Promise<UserResponse> {
    const existing = await this.prisma.user.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    if (existing.role === role) {
      return this.get(id);
    }

    return this.prisma.$transaction(async (tx) => {
      if (existing.role === ADMIN_ROLE) {
        await assertAnotherActiveAdminExists(tx, id);
      }

      const updated = await tx.user.update({
        where: { id },
        data: { role },
        select: USER_SELECT,
      });

      this.logger.log(`User ${id} role changed from ${existing.role} to ${role}`);
      return toResponse(updated);
    });
  }

  /**
   * Reject a branch or department id that does not exist, with a code the UI can
   * translate. Without this the request fails on a raw foreign-key error, which
   * reaches the admin as an untranslatable 500.
   */
  private async assertTenantRefsExist(
    branchId: string | null | undefined,
    departmentId: string | null | undefined,
  ): Promise<void> {
    if (branchId) {
      const branches = await this.prisma.branch.count({ where: { id: branchId } });
      if (branches === 0) {
        throw new BadRequestException(USER_ERROR_CODES.invalidBranch);
      }
    }

    if (departmentId) {
      const departments = await this.prisma.department.count({ where: { id: departmentId } });
      if (departments === 0) {
        throw new BadRequestException(USER_ERROR_CODES.invalidDepartment);
      }
    }
  }
}

/** The slice of the transaction client the guard below needs. Narrow on purpose,
 * so the helper can be called with a mock in the unit tests. */
type UserCounter = { user: { count: (args: { where: Prisma.UserWhereInput }) => Promise<number> } };

/**
 * Throws unless some active admin other than `excludeId` exists.
 *
 * Takes the transaction client so the count and the write that depends on it
 * commit together. Counting on the outer client would read outside the
 * transaction and reopen the race it exists to close.
 */
async function assertAnotherActiveAdminExists(tx: UserCounter, excludeId: string): Promise<void> {
  const remaining = await tx.user.count({
    where: { role: ADMIN_ROLE, isActive: true, id: { not: excludeId } },
  });

  if (remaining === 0) {
    throw new ConflictException(USER_ERROR_CODES.lastActiveAdmin);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === PRISMA_UNIQUE_VIOLATION
  );
}

/**
 * Dates are serialised to ISO strings here rather than left to the JSON
 * serialiser, so the wire shape is the same whatever is doing the encoding.
 */
function toResponse(user: SelectedUser): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    branchId: user.branchId,
    departmentId: user.departmentId,
    isActive: user.isActive,
    deactivatedAt: user.deactivatedAt ? user.deactivatedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
