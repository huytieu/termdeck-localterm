import {
  File,
  FileImage,
  FileText,
  FileVideo,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extOf } from "@/lib/wiki-filter";

interface IconSpec {
  Icon: LucideIcon;
  color: string;
}

// Generic fallback: keeps the original muted, colorless look for every type
// that isn't one of the everyday ones below.
const DEFAULT_SPEC: IconSpec = { Icon: File, color: "text-muted-foreground/50" };

// Only the file types actually worked with day to day get a distinct icon and
// color: markdown notes, HTML, images, and video. Everything else falls through
// to the plain muted File glyph (DEFAULT_SPEC) — no color.
const EXT_ICONS: Record<string, IconSpec> = {
  // Markdown notes
  md: { Icon: FileText, color: "text-sky-500" },
  mdx: { Icon: FileText, color: "text-sky-500" },
  markdown: { Icon: FileText, color: "text-sky-500" },

  // HTML
  html: { Icon: Globe, color: "text-orange-500" },
  htm: { Icon: Globe, color: "text-orange-500" },

  // Pictures
  png: { Icon: FileImage, color: "text-purple-500" },
  jpg: { Icon: FileImage, color: "text-purple-500" },
  jpeg: { Icon: FileImage, color: "text-purple-500" },
  gif: { Icon: FileImage, color: "text-purple-500" },
  svg: { Icon: FileImage, color: "text-purple-400" },
  webp: { Icon: FileImage, color: "text-purple-500" },
  avif: { Icon: FileImage, color: "text-purple-500" },
  ico: { Icon: FileImage, color: "text-purple-500" },
  bmp: { Icon: FileImage, color: "text-purple-500" },

  // Videos
  mp4: { Icon: FileVideo, color: "text-fuchsia-500" },
  mov: { Icon: FileVideo, color: "text-fuchsia-500" },
  webm: { Icon: FileVideo, color: "text-fuchsia-500" },
  mkv: { Icon: FileVideo, color: "text-fuchsia-500" },
  avi: { Icon: FileVideo, color: "text-fuchsia-500" },
};

export const iconSpecForFile = (name: string): IconSpec =>
  EXT_ICONS[extOf(name)] ?? DEFAULT_SPEC;

// Per-extension file icon for the wiki tree. Only .md, .html, images, and video
// get a colored, type-specific icon; everything else uses the generic muted
// File glyph, matching the tree's prior look.
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
