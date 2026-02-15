const SAFE_PROTOCOLS = /^(https?|mailto|tel|ftp):/i;
const HAS_PROTOCOL = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

/** Normalize URL: prepend https:// if no protocol, reject dangerous protocols */
export function normalizeUrl(url: string): string {
  if (HAS_PROTOCOL.test(url)) {
    return SAFE_PROTOCOLS.test(url) ? url : `https://${url.replace(HAS_PROTOCOL, "")}`;
  }
  return `https://${url}`;
}
