const MEDIA_ENDPOINT = "/api/media";

// /api/media streams video bytes with HTTP range support, so a <video src>
// pointing here can play and seek without base64-inlining the whole file.
export const buildMediaUrl = (cwd: string, filePath: string): string => {
  const url = new URL(MEDIA_ENDPOINT, window.location.href);
  url.searchParams.set("cwd", cwd);
  url.searchParams.set("path", filePath);
  return url.toString();
};
