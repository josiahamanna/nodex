import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Request, Response } from "express";

export type MarketplaceS3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string; // optional CDN/origin base for direct links
};

export function readMarketplaceS3ConfigFromEnv(): MarketplaceS3Config | null {
  const endpoint = process.env.NODEX_MARKET_S3_ENDPOINT?.trim() ?? "";
  const bucket = process.env.NODEX_MARKET_S3_BUCKET?.trim() ?? "";
  const accessKeyId = process.env.NODEX_MARKET_S3_ACCESS_KEY?.trim() ?? "";
  const secretAccessKey = process.env.NODEX_MARKET_S3_SECRET_KEY?.trim() ?? "";
  const region = process.env.NODEX_MARKET_S3_REGION?.trim() ?? "auto";
  const publicBaseUrl = process.env.NODEX_MARKET_PUBLIC_BASE_URL?.trim() ?? "";

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: publicBaseUrl || undefined,
  };
}

function s3ClientFor(cfg: MarketplaceS3Config): S3Client {
  const config: S3ClientConfig = {
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true, // works for MinIO and R2
  };
  return new S3Client(config);
}

export async function presignPutArtifact(params: {
  cfg: MarketplaceS3Config;
  objectKey: string;
  contentType: string;
  sha256: string;
  expiresInSeconds?: number;
}): Promise<{ uploadUrl: string }> {
  const { cfg, objectKey, contentType, sha256 } = params;
  const expiresIn = params.expiresInSeconds ?? 900;
  const s3 = s3ClientFor(cfg);
  const cmd = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: objectKey,
    ContentType: contentType,
    Metadata: {
      sha256,
    },
  });
  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn });
  return { uploadUrl };
}

export async function headArtifact(params: {
  cfg: MarketplaceS3Config;
  objectKey: string;
}): Promise<{ exists: true; sha256?: string; sizeBytes?: number; contentType?: string } | { exists: false }> {
  const { cfg, objectKey } = params;
  const s3 = s3ClientFor(cfg);
  try {
    const r = await s3.send(
      new HeadObjectCommand({
        Bucket: cfg.bucket,
        Key: objectKey,
      }),
    );
    const sha256 = r.Metadata?.sha256;
    const sizeBytes = typeof r.ContentLength === "number" ? r.ContentLength : undefined;
    const contentType = r.ContentType;
    return { exists: true, sha256, sizeBytes, contentType };
  } catch {
    return { exists: false };
  }
}

export async function streamArtifactToResponse(params: {
  cfg: MarketplaceS3Config;
  objectKey: string;
  req: Request;
  res: Response;
}): Promise<void> {
  const { cfg, objectKey, res } = params;
  const s3 = s3ClientFor(cfg);
  const r = await s3.send(
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: objectKey,
    }),
  );
  if (r.ContentType) {
    res.setHeader("Content-Type", r.ContentType);
  }
  if (typeof r.ContentLength === "number") {
    res.setHeader("Content-Length", String(r.ContentLength));
  }
  // Basic cache hint for immutable versioned keys.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  const body = r.Body;
  if (!body) {
    res.status(404).end();
    return;
  }
  if (typeof (body as { pipe?: unknown }).pipe === "function") {
    (body as NodeJS.ReadableStream).pipe(res);
    return;
  }
  // Fallback: attempt to read as bytes
  const bytes = await (body as unknown as { transformToByteArray?: () => Promise<Uint8Array> })
    .transformToByteArray?.();
  if (bytes) {
    res.end(Buffer.from(bytes));
    return;
  }
  res.status(500).end();
}

