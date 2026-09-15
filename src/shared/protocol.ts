import { z } from 'zod';

/** Wire frame type codes. See design spec §5.1-§5.2. */
export const FrameType = {
  HELLO: 0x01,
  OFFER: 0x02,
  RESUME: 0x03,
  ACCEPT: 0x04,
  DECLINE: 0x05,
  RESUME_REQUEST: 0x06,
  FILE_START: 0x10,
  DATA: 0x11,
  FILE_END: 0x12,
  FILE_OK: 0x13,
  FILE_RETRY: 0x14,
  FILE_FAILED: 0x15,
  PAUSE: 0x20,
  CANCEL: 0x21,
  DONE: 0x22,
  ERROR: 0x7f,
} as const;

export type FrameTypeValue = (typeof FrameType)[keyof typeof FrameType];

export const PROTOCOL_VERSION = 1;
export const MAX_CONTROL_PAYLOAD = 1 * 1024 * 1024; // 1 MiB
export const CHUNK_SIZE = 1 * 1024 * 1024; // 1 MiB

export const helloSchema = z.object({
  protocolVersion: z.number().int(),
  appVersion: z.string(),
  deviceId: z.string(),
  name: z.string(),
  os: z.enum(['windows', 'macos', 'linux', 'unknown']),
});
export type Hello = z.infer<typeof helloSchema>;

export const transferItemSchema = z.object({
  index: z.number().int().nonnegative(),
  relPath: z.string(),
  kind: z.enum(['file', 'dir']),
  size: z.number().int().nonnegative(),
  mtimeMs: z.number(),
});

export const offerSchema = z.object({
  transferId: z.string(),
  items: z.array(transferItemSchema),
  totalBytes: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
});
export type Offer = z.infer<typeof offerSchema>;

export const resumeSchema = z.object({ transferId: z.string() });
export const resumeRequestSchema = z.object({ transferId: z.string() });

export const acceptSchema = z.object({
  offsets: z.record(z.string(), z.number().int().nonnegative()),
});
export type Accept = z.infer<typeof acceptSchema>;

export const declineSchema = z.object({
  reason: z.enum(['user', 'timeout', 'busy', 'insufficient-space', 'unknown-transfer']),
});

export const fileStartSchema = z.object({
  index: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  size: z.number().int().nonnegative().optional(),
  mtimeMs: z.number().optional(),
});

export const fileEndSchema = z.object({
  index: z.number().int().nonnegative(),
  sha256: z.string(),
});

export const fileOkSchema = z.object({ index: z.number().int().nonnegative() });
export const fileRetrySchema = z.object({ index: z.number().int().nonnegative() });
export const fileFailedSchema = z.object({
  index: z.number().int().nonnegative(),
  reason: z.enum(['hash-mismatch', 'source-missing', 'write-error']),
});

export const errorSchema = z.object({
  code: z.enum([
    'frame-too-large',
    'invalid-path',
    'incompatible-version',
    'malformed-message',
    'internal',
  ]),
  message: z.string(),
});

/** Encode a control frame (JSON payload) as [type][len][json bytes]. */
export function encodeControlFrame(type: FrameTypeValue, payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  if (json.byteLength > MAX_CONTROL_PAYLOAD) {
    throw new Error('frame-too-large');
  }
  const header = Buffer.alloc(5);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(json.byteLength, 1);
  return Buffer.concat([header, json]);
}

/** Encode a binary DATA frame. */
export function encodeDataFrame(chunk: Buffer): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt8(FrameType.DATA, 0);
  header.writeUInt32BE(chunk.byteLength, 1);
  return Buffer.concat([header, chunk]);
}
