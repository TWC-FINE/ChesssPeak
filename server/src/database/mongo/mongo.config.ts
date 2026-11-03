/** Short timeouts so that a down Mongo is reported quickly instead of hanging requests or the boot. */
export const MONGO_CONNECT_OPTIONS = { serverSelectionTimeoutMS: 1000, connectTimeoutMS: 1000 } as const;

export const mongoUri = (): string => process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/unset';
