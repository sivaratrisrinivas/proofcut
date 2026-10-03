/** Vercel functions reject request bodies over 4.5 MB, so the app checks before upload. */
export const MAX_UPLOAD_BYTES = 4_500_000;
