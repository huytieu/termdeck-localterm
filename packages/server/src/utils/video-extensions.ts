// Video classification shared by the server's media-serving route and the
// file-preview surface. Extension-based, matching the /api/media allowlist —
// the route refuses to serve anything not recognized here, so a non-video file
// with a spoofed request can never reach the browser with a sniffable type.
// Restricted to formats browsers can actually play in a <video> element.
const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  ogg: "video/ogg",
  mov: "video/quicktime",
};

const videoExtensionOf = (filePath: string): string | null => {
  const dotIndex = filePath.lastIndexOf(".");
  if (dotIndex === -1) return null;
  const ext = filePath.slice(dotIndex + 1).toLowerCase();
  return ext in VIDEO_MIME_BY_EXTENSION ? ext : null;
};

export const isVideoPath = (filePath: string): boolean => videoExtensionOf(filePath) !== null;

export const videoContentTypeFor = (filePath: string): string | null => {
  const ext = videoExtensionOf(filePath);
  return ext ? (VIDEO_MIME_BY_EXTENSION[ext] ?? null) : null;
};
