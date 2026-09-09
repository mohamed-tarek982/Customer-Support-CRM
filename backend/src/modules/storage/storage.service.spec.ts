import { NotFoundException } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';
import type { EnvService } from '../../config/env';

const BUCKET = 'crm-attachments';

/**
 * S3Client.prototype.send is stubbed rather than the whole module, so the real
 * command classes are still constructed. That is the point of these tests: they
 * assert on the actual command input the SDK would have sent.
 */
describe('StorageService', () => {
  let service: StorageService;
  let send: jest.SpyInstance;

  beforeEach(() => {
    const env = {
      s3Region: 'auto',
      s3Endpoint: 'https://example.r2.cloudflarestorage.com',
      s3Bucket: BUCKET,
      s3AccessKeyId: 'test-key-id',
      s3SecretAccessKey: 'test-secret',
    } as unknown as EnvService;

    send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    service = new StorageService(env);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function commandFromLastCall(): PutObjectCommand | GetObjectCommand {
    return send.mock.calls[0]?.[0] as PutObjectCommand | GetObjectCommand;
  }

  describe('upload', () => {
    it('sends a PutObjectCommand against the configured bucket', async () => {
      const body = Buffer.from('hello world');

      const result = await service.upload('smoke-test/file.txt', body, 'text/plain');

      expect(send).toHaveBeenCalledTimes(1);
      const command = commandFromLastCall();
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: BUCKET,
        Key: 'smoke-test/file.txt',
        Body: body,
        ContentType: 'text/plain',
      });
      expect(result).toEqual({
        key: 'smoke-test/file.txt',
        bucket: BUCKET,
        size: body.length,
        contentType: 'text/plain',
      });
    });

    it('never sends an ACL header, which Cloudflare R2 rejects', async () => {
      await service.upload('smoke-test/file.txt', Buffer.from('x'), 'text/plain');

      const input = commandFromLastCall().input as unknown as Record<string, unknown>;
      expect(input).not.toHaveProperty('ACL');
      expect(Object.keys(input)).not.toContain('ACL');
    });
  });

  describe('download', () => {
    function mockBody(bytes: Uint8Array, contentType = 'text/plain') {
      send.mockResolvedValue({
        Body: { transformToByteArray: () => Promise.resolve(bytes) },
        ContentType: contentType,
      });
    }

    it('sends a GetObjectCommand against the configured bucket', async () => {
      mockBody(new Uint8Array([104, 105]));

      const result = await service.download('smoke-test/file.txt');

      const command = commandFromLastCall();
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toMatchObject({ Bucket: BUCKET, Key: 'smoke-test/file.txt' });
      expect(result.body.toString('utf8')).toBe('hi');
      expect(result.contentType).toBe('text/plain');
    });

    it('round-trips bytes unchanged', async () => {
      const original = Buffer.from('the quick brown fox, 0x00 0xff');
      mockBody(new Uint8Array(original));

      const { body } = await service.download('smoke-test/file.txt');

      expect(body.equals(original)).toBe(true);
    });

    it('translates a missing key into a 404 rather than a raw SDK error', async () => {
      const error = new Error('The specified key does not exist.');
      error.name = 'NoSuchKey';
      send.mockRejectedValue(error);

      await expect(service.download('missing.txt')).rejects.toThrow(NotFoundException);
    });

    it('rethrows errors that are not a missing key', async () => {
      send.mockRejectedValue(new Error('network unreachable'));

      await expect(service.download('any.txt')).rejects.toThrow('network unreachable');
    });
  });

  describe('presignDownload', () => {
    it('produces a signed URL for the configured bucket and key', async () => {
      const url = await service.presignDownload('smoke-test/file.txt', 60);

      expect(url).toContain(BUCKET);
      expect(url).toContain('X-Amz-Signature');
      expect(url).toContain('X-Amz-Expires=60');
    });
  });

  describe('buildKey', () => {
    it('namespaces the key and keeps it unique per upload', () => {
      const first = service.buildKey('smoke-test', 'report.pdf');
      const second = service.buildKey('smoke-test', 'report.pdf');

      expect(first.startsWith('smoke-test/')).toBe(true);
      expect(first.endsWith('report.pdf')).toBe(true);
      expect(first).not.toBe(second);
    });

    it('strips characters that would break a path', () => {
      const key = service.buildKey('smoke-test', '../../etc/passwd; rm -rf');

      expect(key.includes('..')).toBe(false);
      expect(key.split('/')).toHaveLength(2);
    });
  });
});
