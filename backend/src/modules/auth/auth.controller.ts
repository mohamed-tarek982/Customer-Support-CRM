import { Body, Controller, HttpCode, HttpStatus, Post, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService, type LoginResult, type TokenPair } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { UserTypes } from './decorators/user-type.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/**
 * Auth endpoints for SCRUM-42 / SCRUM-43.
 *
 * `login` and `forgot-password` are rate limited via `@nestjs/throttler`. The
 * default throttler keys by IP; behind a shared NAT that can produce false
 * positives, so a second per-email bucket is a future refinement.
 *
 * Out of scope: email verification, SSO, and user CRUD (SCRUM-34).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto.email, dto.password);
  }

  /** Rotates the pair: the presented refresh token is revoked as part of the call. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: RefreshDto): Promise<{ success: true }> {
    return this.authService.logout(dto.refreshToken);
  }

  /**
   * Always returns 202 with an empty body, whether or not the email matched a
   * row, so the response cannot be used to enumerate accounts.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  /** Echoes the token's claims. Useful for verifying tenant scoping end to end. */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  /**
   * Scaffolding probe for the staff/customer boundary (SCRUM-43): a customer
   * JWT reaching this route gets 403 from `UserTypeGuard`, proving the API is
   * the boundary rather than any frontend redirect. Staff-only controllers in
   * later stories carry the same `@UserTypes('staff')` annotation.
   */
  @UseGuards(JwtAuthGuard)
  @UserTypes('staff')
  @Get('staff-area')
  staffArea(@CurrentUser() user: AuthenticatedUser): { ok: true; sub: string } {
    return { ok: true, sub: user.sub };
  }
}
