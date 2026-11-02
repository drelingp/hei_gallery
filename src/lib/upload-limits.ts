/**
 * Vercel serverless request bodies are capped at 4.5 MB and that cap is not
 * configurable. Stay under it for uploads that pass through a route handler.
 * Larger files (typically GLB models) go straight to R2 with a presigned PUT.
 */
export const SERVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
