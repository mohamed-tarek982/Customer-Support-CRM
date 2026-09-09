import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { EnvService } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type {
  AccessTokenPayload,
  AuthenticatedUser,
  RefreshTokenPayload,
  UserType,
} from '../../common/types/authenticated-user';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends TokenPair {
  user: AuthenticatedUser;
}

/** Identifies a principal for session bookkeeping without a full user object. */
interface PrincipalRef {
  userType: UserType;
  id: string;
}

/** Cost factor for password hashing. Keep in sync with prisma/seed.ts. */
export const BCRYPT_ROUNDS = 10;

/**
 * A bcrypt hash of no particular password. Used to spend comparable CPU time
 * when neither table holds the email, so login timing does not leak which
 * accounts exist. Reference: the login handler below.
 */
const DUMMY_HASH = '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';

/**
 * jsonwebtoken types `expiresIn` as a narrow template literal ("15m", "7d", ...).
 * The value reaches us as a plain string from the environment, where it has
 * already been validated, so the cast is narrowing a known-good value.
 */
type ExpiresIn = JwtSignOptions['expiresIn'];

/**
 * Refresh and reset tokens are stored as a SHA-256 digest rather than a bcrypt
 * hash. bcrypt salts every hash, which would make the stored value impossible to
 * look up; SHA-256 is deterministic, so the row can be found by digest, and the
 * raw token still never touches the database.
 */
function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Parse a short duration string ("15m", "1h", "7d") into milliseconds. */
function durationToMs(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Unparseable duration: ${value}`);
  }
  const factor: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return Number(match[1] ?? '0') * (factor[match[2] ?? 'ms'] ?? 1);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly env: EnvService,
    private readonly mail: MailService,
  ) {}

  /**
   * Verify credentials and issue a fresh access/refresh pair.
   *
   * The `users` table is tried before `customers` on purpose: if the same email
   * somehow exists in both, the staff account wins. Every failure path throws
   * the identical `UnauthorizedException('Invalid credentials')` so the response
   * cannot be used to tell which table an email belongs to, or whether it exists
   * at all.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const normalized = email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    const customer = user
      ? null
      : await this.prisma.customer.findUnique({ where: { email: normalized } });

    if ((!user || !user.isActive) && (!customer || !customer.isActive)) {
      // Spend the same time as a real comparison would, so response timing does
      // not leak whether the account exists.
      await bcrypt.compare(password, DUMMY_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    const principal: AuthenticatedUser = user
      ? {
          sub: user.id,
          email: user.email,
          role: user.role,
          userType: 'staff',
          branchId: user.branchId,
          departmentId: user.departmentId,
        }
      : {
          sub: customer!.id,
          email: customer!.email,
          role: '',
          userType: 'customer',
          branchId: null,
          departmentId: null,
        };

    const passwordHash = user ? user.passwordHash : customer!.passwordHash;
    const passwordMatches = await bcrypt.compare(password, passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(principal);
    return { ...tokens, user: principal };
  }

  /**
   * Rotate a refresh token: the presented token is revoked and a brand-new pair
   * is issued. A token that verifies but has no live row is treated as replay of
   * an already-rotated token, and every session for that principal is revoked.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const tokenHash = sha256(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true, customer: true },
    });

    if (!stored || stored.revokedAt !== null || stored.expiresAt.getTime() <= Date.now()) {
      if (stored?.revokedAt) {
        this.logger.warn(
          `Refresh token replay detected for ${payload.userType} ${payload.sub}; revoking all sessions`,
        );
        await this.revokeAllForUser({ userType: payload.userType, id: payload.sub });
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    const userType = stored.userType as UserType;

    const principal: AuthenticatedUser | null =
      userType === 'customer'
        ? stored.customer && stored.customer.isActive
          ? {
              sub: stored.customer.id,
              email: stored.customer.email,
              role: '',
              userType: 'customer',
              branchId: null,
              departmentId: null,
            }
          : null
        : stored.user && stored.user.isActive
          ? {
              sub: stored.user.id,
              email: stored.user.email,
              role: stored.user.role,
              userType: 'staff',
              branchId: stored.user.branchId,
              departmentId: stored.user.departmentId,
            }
          : null;

    if (!principal) {
      throw new UnauthorizedException('Account is disabled');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(principal);
  }

  /**
   * Revoke a refresh token. Idempotent: logging out with a token that is already
   * revoked or unknown succeeds, so a client can always clear its session.
   */
  async logout(refreshToken: string): Promise<{ success: true }> {
    const tokenHash = sha256(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  /**
   * Revoke every live refresh token for a principal. Used on replay detection
   * and after a password reset.
   */
  async revokeAllForUser({ userType, id }: PrincipalRef): Promise<void> {
    const where =
      userType === 'customer'
        ? { customerId: id, revokedAt: null }
        : { userId: id, revokedAt: null };

    await this.prisma.refreshToken.updateMany({ where, data: { revokedAt: new Date() } });
  }

  /**
   * Start a password-reset. Looks the email up in `users` then `customers`; if
   * no active principal matches it returns silently, so the caller (and the
   * HTTP 202 it always sends) cannot be used to enumerate accounts.
   */
  async forgotPassword(email: string): Promise<void> {
    const normalized = email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    const customer = user
      ? null
      : await this.prisma.customer.findUnique({ where: { email: normalized } });

    const target =
      user && user.isActive
        ? { userType: 'staff' as const, id: user.id }
        : customer && customer.isActive
          ? { userType: 'customer' as const, id: customer.id }
          : null;

    if (!target) {
      return;
    }

    const rawToken = randomBytes(32).toString('base64url');

    await this.prisma.passwordResetToken.create({
      data: {
        userType: target.userType,
        userId: target.userType === 'staff' ? target.id : null,
        customerId: target.userType === 'customer' ? target.id : null,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + durationToMs(this.env.passwordResetTtl)),
      },
    });

    await this.mail.sendPasswordReset(normalized, rawToken, 'en');
  }

  /**
   * Complete a password-reset. Missing, already-used and expired tokens all
   * throw the identical `BadRequestException` so the endpoint cannot be probed.
   * On success the principal's password is rehashed, the token is burned, and
   * every prior refresh token for that principal is revoked so old sessions
   * cannot outlive the reset.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });

    if (!row || row.usedAt !== null || row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const userType = row.userType as UserType;
    const principalId = (userType === 'customer' ? row.customerId : row.userId) ?? '';
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    if (userType === 'customer') {
      await this.prisma.customer.update({
        where: { id: principalId },
        data: { passwordHash },
      });
    } else {
      await this.prisma.user.update({
        where: { id: principalId },
        data: { passwordHash },
      });
    }

    await this.prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });

    await this.revokeAllForUser({ userType, id: principalId });
  }

  /** Hash a plaintext password for storage. Exposed for SCRUM-34's user CRUD. */
  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.env.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async issueTokens(principal: AuthenticatedUser): Promise<TokenPair> {
    const accessPayload: AccessTokenPayload = { ...principal };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.env.jwtAccessSecret,
      expiresIn: this.env.jwtAccessTtl as ExpiresIn,
    });

    // `jti` makes every refresh token unique even when two are minted in the
    // same second for the same user, so the tokenHash unique index never clashes.
    const jti = sha256(`${principal.sub}:${Date.now()}:${Math.random()}`);

    const refreshToken = await this.jwt.signAsync(
      { sub: principal.sub, jti, userType: principal.userType },
      { secret: this.env.jwtRefreshSecret, expiresIn: this.env.jwtRefreshTtl as ExpiresIn },
    );

    const decoded = this.jwt.decode<RefreshTokenPayload | null>(refreshToken);
    const expiresAt =
      decoded?.exp !== undefined
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userType: principal.userType,
        userId: principal.userType === 'staff' ? principal.sub : null,
        customerId: principal.userType === 'customer' ? principal.sub : null,
        jti,
        tokenHash: sha256(refreshToken),
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }
}
