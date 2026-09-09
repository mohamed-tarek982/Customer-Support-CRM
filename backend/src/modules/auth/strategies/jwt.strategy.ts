import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EnvService } from '../../../config/env';
import type {
  AccessTokenPayload,
  AuthenticatedUser,
} from '../../../common/types/authenticated-user';

/**
 * Validates the access token and puts an AuthenticatedUser on `request.user`.
 *
 * The tenant-scoping fields travel inside the token, so guards and the audit-log
 * interceptor can read branch/department without a database round trip.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(env: EnvService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.jwtAccessSecret,
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    if (!payload.sub) {
      throw new UnauthorizedException('Malformed access token');
    }

    // Zero-trust: every field comes from the signed token, never the request body.
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role ?? '',
      userType: payload.userType === 'customer' ? 'customer' : 'staff',
      branchId: payload.branchId ?? null,
      departmentId: payload.departmentId ?? null,
    };
  }
}
