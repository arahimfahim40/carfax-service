import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type UploadResult = {
  url: string;
  key: string;
  bucket: string;
};

export type UploadPdfOptions = {
  filePath?: string;
  body?: Buffer | Uint8Array;
  key: string;
  isPrivate?: boolean;
  contentType?: string;
};

type BucketScope = 'public' | 'private';

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly clients = new Map<BucketScope, S3Client>();

  constructor(private readonly config: ConfigService) {}

  async uploadPdf(opts: UploadPdfOptions): Promise<UploadResult> {
    const {
      filePath,
      body,
      key,
      isPrivate = true,
      contentType = 'application/pdf',
    } = opts;

    if (!filePath && !body) {
      throw new Error('uploadPdf: either filePath or body must be provided');
    }

    const bucket = this.bucket(isPrivate);
    const client = this.client(isPrivate);

    const Body = body ?? createReadStream(filePath!);
    const ContentLength = body
      ? body.byteLength
      : (await stat(filePath!)).size;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body,
        ContentLength,
        ContentType: contentType,
        ContentDisposition: `inline; filename="${basename(key)}"`,
      }),
    );

    this.logger.log(`Uploaded s3://${bucket}/${key}`);

    return {
      url: this.publicUrl(bucket, key),
      key,
      bucket,
    };
  }

  async getSignedDownloadUrl(
    key: string,
    opts: { isPrivate?: boolean; ttlSeconds?: number } = {},
  ): Promise<string> {
    const { isPrivate = true, ttlSeconds = this.signedUrlTtl() } = opts;
    const client = this.client(isPrivate);
    const bucket = this.bucket(isPrivate);
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }

  buildReportKey(vin: string, when: Date = new Date()): string {
    const iso = when.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
    return `reports/${vin}/${iso}.pdf`;
  }

  private client(isPrivate: boolean): S3Client {
    const scope: BucketScope = isPrivate ? 'private' : 'public';
    const cached = this.clients.get(scope);
    if (cached) return cached;

    const config: S3ClientConfig = {
      region: this.config.get<string>('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.requiredEnv(
          isPrivate ? 'AWS_PRIVATE_ACCESS_KEY' : 'AWS_ACCESS_KEY',
        ),
        secretAccessKey: this.requiredEnv(
          isPrivate ? 'AWS_PRIVATE_SECRET_KEY' : 'AWS_SECRET_KEY',
        ),
      },
    };
    const endpoint = this.config.get<string>('AWS_ENDPOINT');
    if (endpoint) {
      config.endpoint = endpoint;
    }
    const client = new S3Client(config);
    this.clients.set(scope, client);
    return client;
  }

  private bucket(isPrivate: boolean): string {
    return this.requiredEnv(isPrivate ? 'AWS_PRIVATE_BUCKET' : 'AWS_BUCKET');
  }

  private publicUrl(bucket: string, key: string): string {
    const endpoint = this.config.get<string>('AWS_ENDPOINT');
    if (endpoint) {
      return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
    }
    const region = this.config.get<string>('AWS_REGION', 'us-east-1');
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  private signedUrlTtl(): number {
    const raw = this.config.get<string>('AWS_SIGNED_URL_TTL');
    const ttl = Number(raw);
    return Number.isFinite(ttl) && ttl > 0 ? ttl : 900;
  }

  private requiredEnv(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`Missing required env var: ${key}`);
    }
    return value;
  }
}
