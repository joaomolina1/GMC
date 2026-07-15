/**
 * Sanitizes a filename so it is safe to use as a Supabase Storage object key.
 *
 * Supabase Storage validates keys against a narrow S3-safe character set
 * (see `isValidKey` in https://github.com/supabase/storage/blob/master/src/storage/limits.ts):
 * `\w | / | ! | - | . | * | ' | ( | ) | space | & | $ | @ | = | ; | : | + | , | ?`.
 * Accented letters (á, ã, ç, õ, é, ...) and other non-ASCII characters are
 * NOT in that set, so uploading a file like "Procedimento de Gestão.pdf"
 * fails with `InvalidKey`. This strips accents and replaces any remaining
 * unsafe character (including `/`, to avoid creating unintended subpaths)
 * with `_`, while leaving common punctuation and spaces untouched so the
 * sanitized name still reads close to the original.
 */
const DISALLOWED_STORAGE_CHARS = /[^\w!\-.*'() &$@=;:+,?]/g;

export function sanitizeStorageFilename(name: string, maxLength = 150): string {
  const withoutDiacritics = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const safe = withoutDiacritics.replace(DISALLOWED_STORAGE_CHARS, "_");
  const collapsed = safe.replace(/_+/g, "_").replace(/^[_.\s]+|[_.\s]+$/g, "");
  const result = collapsed || "ficheiro";

  if (result.length <= maxLength) return result;

  const dotIndex = result.lastIndexOf(".");
  const hasShortExtension = dotIndex > 0 && result.length - dotIndex <= 10;
  if (hasShortExtension) {
    const ext = result.slice(dotIndex);
    return `${result.slice(0, maxLength - ext.length)}${ext}`;
  }
  return result.slice(0, maxLength);
}
