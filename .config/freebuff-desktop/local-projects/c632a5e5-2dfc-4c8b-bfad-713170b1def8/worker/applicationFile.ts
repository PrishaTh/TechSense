/**
 * The supplied rental application PDF, served byte for byte.
 *
 * The protected file lives at `private/RENTAL_APPLICATION_FORM.pdf` and is
 * embedded here by `npm run embed:application`. Nothing in the app regenerates
 * or reflows it: the bytes are the uploaded file, and the recorded SHA-256 is
 * the checksum of that file. Until the file is embedded, the API answers 503
 * rather than substituting a different form.
 */
export const APPLICATION_FILE_NAME = "RENTAL_APPLICATION_FORM.pdf";
export const APPLICATION_FILE_PATH = "private/RENTAL_APPLICATION_FORM.pdf";
export const APPLICATION_SHA256 = "";
export const APPLICATION_BASE64 = "";

let cached: Uint8Array | null = null;

export function applicationPdfBytes(): Uint8Array | null {
  if (!APPLICATION_BASE64) return null;
  if (cached) return cached;
  const binary = atob(APPLICATION_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  cached = bytes;
  return bytes;
}
