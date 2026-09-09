import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UserTypeGuard } from './guards/user-type.guard';
import { MailModule } from '../mail/mail.module';

/**
 * Both `JwtAuthGuard` and `UserTypeGuard` are registered globally here
 * (SCRUM-43), in that order: authentication runs first and populates
 * `request.user`, then the staff/customer boundary is enforced on every
 * endpoint regardless of what the frontend does. Routes opt out of
 * authentication with `@Public()`; `UserTypeGuard` is a no-op on any route
 * that carries no `@UserTypes(...)` metadata. RolesGuard stays opt-in
 * (`@UseGuards`) until SCRUM-34 gives it a real policy engine.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    // Secrets are passed per-signature in AuthService because access and refresh
    // tokens are signed with different keys.
    JwtModule.register({}),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    UserTypeGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: UserTypeGuard },
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard, UserTypeGuard, JwtModule, PassportModule],
})
export class AuthModule {}
