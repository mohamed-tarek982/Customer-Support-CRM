import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Staff account administration (SCRUM-34).
 *
 * `AuthModule` is imported for two things: `RolesGuard`, which the controller
 * opts into, and `AuthService.hashPassword`, so account creation uses the same
 * bcrypt cost factor as the login path rather than a second copy of it.
 *
 * `PrismaModule` is global (see prisma.module.ts), so it is not listed here.
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
