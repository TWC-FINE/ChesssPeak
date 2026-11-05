import { dbConnectTimeoutMs } from '../../deploy-config';

/** Bounded timeouts so that a down Mongo is reported instead of hanging requests or the boot. */
export const MONGO_CONNECT_OPTIONS = { serverSelectionTimeoutMS: dbConnectTimeoutMs(), connectTimeoutMS: dbConnectTimeoutMs() } as const;

export const mongoUri = (): string => process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/unset';
