import { IsJWT, IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsJWT({ message: 'refreshToken must be a valid JWT' })
  refreshToken!: string;
}
