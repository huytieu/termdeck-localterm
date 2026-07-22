import {
  Database,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileCog,
  FileImage,
  FileJson,
  FileLock2,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideo,
  Globe,
  Hash,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extOf } from "@/lib/wiki-filter";

interface IconSpec {
  Icon: LucideIcon;
  color: string;
}

// Generic fallback keeps the original muted look for unknown extensions.
const DEFAULT_SPEC: IconSpec = { Icon: File, color: "text-muted-foreground/50" };

// Extension → icon + accent tint. Distinct shapes are the primary signal so the
// mapping still reads on any theme; the color is a secondary cue. Grouped by
// file family; add rows here to teach the tree a new type.
const EXT_ICONS: Record<string, IconSpec> = {
  // Docs / prose
  md: { Icon: FileText, color: "text-sky-500" },
  mdx: { Icon: FileText, color: "text-sky-500" },
  markdown: { Icon: FileText, color: "text-sky-500" },
  txt: { Icon: FileText, color: "text-muted-foreground/70" },
  rst: { Icon: FileText, color: "text-muted-foreground/70" },
  pdf: { Icon: FileText, color: "text-red-500" },

  // Web
  html: { Icon: Globe, color: "text-orange-500" },
  htm: { Icon: Globe, color: "text-orange-500" },
  xml: { Icon: FileCode2, color: "text-orange-400" },
  css: { Icon: Hash, color: "text-pink-500" },
  scss: { Icon: Hash, color: "text-pink-500" },
  sass: { Icon: Hash, color: "text-pink-500" },
  less: { Icon: Hash, color: "text-pink-500" },

  // Data / config
  json: { Icon: FileJson, color: "text-amber-500" },
  jsonc: { Icon: FileJson, color: "text-amber-500" },
  yml: { Icon: FileCog, color: "text-teal-500" },
  yaml: { Icon: FileCog, color: "text-teal-500" },
  toml: { Icon: FileCog, color: "text-teal-500" },
  ini: { Icon: FileCog, color: "text-teal-500" },
  env: { Icon: FileCog, color: "text-teal-500" },
  conf: { Icon: FileCog, color: "text-teal-500" },
  config: { Icon: FileCog, color: "text-teal-500" },

  // Code
  ts: { Icon: FileCode2, color: "text-blue-500" },
  tsx: { Icon: FileCode2, color: "text-blue-500" },
  js: { Icon: FileCode2, color: "text-yellow-500" },
  jsx: { Icon: FileCode2, color: "text-yellow-500" },
  mjs: { Icon: FileCode2, color: "text-yellow-500" },
  cjs: { Icon: FileCode2, color: "text-yellow-500" },
  py: { Icon: FileCode2, color: "text-green-500" },
  go: { Icon: FileCode2, color: "text-cyan-500" },
  rs: { Icon: FileCode2, color: "text-orange-600" },
  java: { Icon: FileCode2, color: "text-red-400" },
  rb: { Icon: FileCode2, color: "text-red-500" },
  c: { Icon: FileCode2, color: "text-blue-400" },
  cpp: { Icon: FileCode2, color: "text-blue-400" },
  h: { Icon: FileCode2, color: "text-blue-400" },

  // Shell
  sh: { Icon: FileTerminal, color: "text-emerald-500" },
  bash: { Icon: FileTerminal, color: "text-emerald-500" },
  zsh: { Icon: FileTerminal, color: "text-emerald-500" },
  fish: { Icon: FileTerminal, color: "text-emerald-500" },

  // Tabular
  csv: { Icon: FileSpreadsheet, color: "text-green-600" },
  tsv: { Icon: FileSpreadsheet, color: "text-green-600" },
  xlsx: { Icon: FileSpreadsheet, color: "text-green-600" },
  xls: { Icon: FileSpreadsheet, color: "text-green-600" },

  // Images
  png: { Icon: FileImage, color: "text-purple-500" },
  jpg: { Icon: FileImage, color: "text-purple-500" },
  jpeg: { Icon: FileImage, color: "text-purple-500" },
  gif: { Icon: FileImage, color: "text-purple-500" },
  svg: { Icon: FileImage, color: "text-purple-400" },
  webp: { Icon: FileImage, color: "text-purple-500" },
  avif: { Icon: FileImage, color: "text-purple-500" },
  ico: { Icon: FileImage, color: "text-purple-500" },
  bmp: { Icon: FileImage, color: "text-purple-500" },

  // Media
  mp4: { Icon: FileVideo, color: "text-fuchsia-500" },
  mov: { Icon: FileVideo, color: "text-fuchsia-500" },
  webm: { Icon: FileVideo, color: "text-fuchsia-500" },
  mkv: { Icon: FileVideo, color: "text-fuchsia-500" },
  avi: { Icon: FileVideo, color: "text-fuchsia-500" },
  mp3: { Icon: FileAudio, color: "text-rose-500" },
  wav: { Icon: FileAudio, color: "text-rose-500" },
  m4a: { Icon: FileAudio, color: "text-rose-500" },
  flac: { Icon: FileAudio, color: "text-rose-500" },
  ogg: { Icon: FileAudio, color: "text-rose-500" },

  // Archives
  zip: { Icon: FileArchive, color: "text-orange-400" },
  tar: { Icon: FileArchive, color: "text-orange-400" },
  gz: { Icon: FileArchive, color: "text-orange-400" },
  tgz: { Icon: FileArchive, color: "text-orange-400" },
  rar: { Icon: FileArchive, color: "text-orange-400" },
  "7z": { Icon: FileArchive, color: "text-orange-400" },

  // Data stores
  sql: { Icon: Database, color: "text-cyan-500" },
  db: { Icon: Database, color: "text-cyan-500" },
  sqlite: { Icon: Database, color: "text-cyan-500" },

  // Secrets / keys
  lock: { Icon: FileLock2, color: "text-amber-400" },
  pem: { Icon: FileLock2, color: "text-amber-400" },
  key: { Icon: FileLock2, color: "text-amber-400" },
  crt: { Icon: FileLock2, color: "text-amber-400" },

  // Fonts
  woff: { Icon: FileType, color: "text-indigo-400" },
  woff2: { Icon: FileType, color: "text-indigo-400" },
  ttf: { Icon: FileType, color: "text-indigo-400" },
  otf: { Icon: FileType, color: "text-indigo-400" },
};

export const iconSpecForFile = (name: string): IconSpec =>
  EXT_ICONS[extOf(name)] ?? DEFAULT_SPEC;

// Per-extension file icon for the wiki tree. Falls back to the generic muted
// File glyph for unknown types, matching the tree's prior look.
export const WikiFileIcon = ({
  name,
  className,
}: {
  name: string;
  className?: string;
}) => {
  const { Icon, color } = iconSpecForFile(name);
  return <Icon className={cn("size-3.5 shrink-0", color, className)} />;
};
