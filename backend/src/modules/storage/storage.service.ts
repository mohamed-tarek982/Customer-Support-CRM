import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { EnvService } from '../../config/env';

export interface UploadedObject {
  key: string;
  bucket: string;
  size: number;
  contentType: string;
}

/**
 * Wraps a managed S3-compatible bucket (Cloudflare R2 or Supabase Storage).
 *
 * Two constraints come from the provider, not from us:
 *   - `forcePathStyle: true` is required by R2 and works with Supabase too.
 *   - No `ACL` may be sent on PutObject. R2 rejects the header outright, and
 *     Supabase ignores it. Bucket-level policy governs access instead.
 *
 * Files are never written to local disk: the container filesystem is ephemeral
 * and anything stored there is lost on redeploy.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;

  constructor(private readonly env: EnvService) {
    this.client = new S3Client({
      region: env.s3Region,
      endpoint: env.s3Endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.s3AccessKeyId,
        secretAccessKey: env.s3SecretAccessKey,
      },
    });
  }

  get bucket(): string {
    return this.env.s3Bucket;
  }

  /**
   * Namespaced, collision-proof key for an uploaded file.
   *
   * Dot runs are collapsed and leading dots stripped so a name like
   * `../../etc/passwd` cannot survive into the key. Object keys are not
   * filesystem paths, but the key is echoed back to clients and used in URLs,
   * and a key containing `..` is a trap waiting for whoever mirrors the bucket
   * to disk.
   */
  buildKey(prefix: string, originalName: string): string {
    const safeName =
      originalName
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/[.]{2,}/g, '.')
        .replace(/^[.]+/, '')
        .slice(-100) || 'file';

    return `${prefix}/${randomUUID()}-${safeName}`;
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<UploadedObject> {
    // NOTE: no ACL field — R2 rejects it. Access is controlled by bucket policy.
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    this.logger.log(`Uploaded ${key} (${body.length} bytes) to ${this.bucket}`);

    return { key, bucket: this.bucket, size: body.length, contentType };
  }

  /** Fetches an object's bytes. Throws NotFoundException when the key is absent. */
  async download(key: string): Promise<{ body: Buffer; contentType: string }> {
    let response: GetObjectCommandOutput;

    try {
      response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error: unknown) {
      const name = (error as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') {
        throw new NotFoundException(`No object at key "${key}"`);
      }
      throw error;
    }

    if (!response.Body) {
      throw new NotFoundException(`Object "${key}" has no body`);
    }

    const bytes = await response.Body.transformToByteArray();

    return {
      body: Buffer.from(bytes),
      contentType: response.ContentType ?? 'application/octet-stream',
    };
  }

  /** Time-limited download URL, so bytes never have to pass through the API. */
  presignDownload(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
