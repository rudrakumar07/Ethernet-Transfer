import { FrameType, type FrameTypeValue } from '../../../shared/protocol';
import {
  helloSchema,
  offerSchema,
  resumeSchema,
  resumeRequestSchema,
  acceptSchema,
  declineSchema,
  fileStartSchema,
  fileEndSchema,
  fileOkSchema,
  fileRetrySchema,
  fileFailedSchema,
  errorSchema,
} from '../../../shared/protocol';

const SCHEMAS: Partial<Record<FrameTypeValue, { parse: (v: unknown) => unknown }>> = {
  [FrameType.HELLO]: helloSchema,
  [FrameType.OFFER]: offerSchema,
  [FrameType.RESUME]: resumeSchema,
  [FrameType.RESUME_REQUEST]: resumeRequestSchema,
  [FrameType.ACCEPT]: acceptSchema,
  [FrameType.DECLINE]: declineSchema,
  [FrameType.FILE_START]: fileStartSchema,
  [FrameType.FILE_END]: fileEndSchema,
  [FrameType.FILE_OK]: fileOkSchema,
  [FrameType.FILE_RETRY]: fileRetrySchema,
  [FrameType.FILE_FAILED]: fileFailedSchema,
  [FrameType.ERROR]: errorSchema,
};

/** Decode a control frame's JSON payload with schema validation. Throws on malformed input. */
export function decodeControlPayload<T>(type: FrameTypeValue, payload: Buffer): T {
  const schema = SCHEMAS[type];
  if (!schema) throw new Error('malformed-message');
  let json: unknown;
  try {
    json = JSON.parse(payload.toString('utf8'));
  } catch {
    throw new Error('malformed-message');
  }
  return schema.parse(json) as T;
}
