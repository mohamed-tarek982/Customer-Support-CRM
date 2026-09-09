import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseFilePipeBuilder,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { StorageService, type UploadedObject } from './storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/** 10 MB ceiling on the smoke-test endpoint. SCRUM-7 sets the real limit. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * The download routes take a caller-supplied key, so they are pinned to the
 * prefix this controller writes to. Without it any authenticated user could
 * read any object in the bucket. SCRUM-7 replaces this with per-attachment
 * ownership checks.
 */
const ALLOWED_PREFIX = 'smoke-test/';

function assertSmokeTestKey(key: string): void {
  if (!key.startsWith(ALLOWED_PREFIX) || key.includes('..')) {
    throw new BadRequestException(`key must start with "${ALLOWED_PREFIX}"`);
  }
}

/**
 * TODO: replace with real attachment endpoints in SCRUM-7.
 *
 * These two routes exist only to satisfy the SCRUM-42 acceptance criterion that
 * object storage round-trips a file. They are not a public API and should be
 * deleted, not extended, when ticket/customer attachments are built.
 *
 * Keys are percent-encoded in the download path because they contain slashes.
 */
@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('test-upload')
  @UseInterceptors(FileInterceptor('file'))
  async testUpload(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: MAX_UPLOAD_BYTES })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ): Promise<UploadedObject & { downloadPath: string }> {
    const key = this.storage.buildKey('smoke-test', file.originalname);
    const uploaded = await this.storage.upload(
      key,
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );

    return { ...uploaded, downloadPath: `/storage/test-download/${encodeURIComponent(key)}` };
  }

  /** Streams the stored bytes back, so a caller can diff them against the original. */
  @Get('test-download/:key')
  async testDownload(@Param('key') key: string, @Res() res: Response): Promise<void> {
    assertSmokeTestKey(key);

    const { body, contentType } = await this.storage.download(key);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', body.length);
    res.send(body);
  }

  /** Presigned URL variant, which is how SCRUM-7 will actually serve attachments. */
  @Get('test-download-url/:key')
  async testDownloadUrl(@Param('key') key: string): Promise<{ url: string; expiresIn: number }> {
    assertSmokeTestKey(key);

    const expiresIn = 300;
    return { url: await this.storage.presignDownload(key, expiresIn), expiresIn };
  }
}
