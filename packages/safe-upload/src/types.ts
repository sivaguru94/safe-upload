/** What kind of information a piece of metadata gives away. */
export type Category =
  | 'location'
  | 'time'
  | 'device'
  | 'people'
  | 'author'
  | 'descriptions'
  | 'software'
  | 'history'
  | 'thumbnail'
  | 'hidden'
  | 'ai'
  | 'provenance'
  | 'settings'
  | 'other';

export type Risk = 'high' | 'medium' | 'low';

export type Format = 'jpeg' | 'png' | 'webp' | 'heic' | 'avif' | 'unknown';

/** Where in the file a finding lives. */
export type Source = 'exif' | 'xmp' | 'iptc' | 'jpeg' | 'png' | 'webp' | 'heif' | 'icc';

export interface Finding {
  category: Category;
  source: Source;
  /** Stable machine key, e.g. "exif.GPSLatitude". */
  key: string;
  /** Human label, e.g. "GPS latitude". */
  label: string;
  /** Human-readable value, truncated for very long data. */
  value: string;
  /** False when this format cannot drop it without re-encoding the picture. */
  removable: boolean;
}

export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  /** Compass direction the camera was facing, degrees. */
  direction?: number;
}

export interface HiddenMedia {
  kind: 'video' | 'image' | 'data';
  mime: string;
  /** Short description such as "Motion photo video". */
  label: string;
  bytes: Uint8Array;
}

export interface Report {
  format: Format;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  /** EXIF orientation 1..8 when present. */
  orientation?: number;
  findings: Finding[];
  /** Categories with at least one finding, in display order. */
  categories: Category[];
  /** Convenience summaries for the most revealing items. */
  summary: {
    gps?: GpsPoint;
    capturedAt?: string;
    timeZone?: string;
    device?: string;
    serialNumbers: string[];
    /** People tagged as appearing in the photo. */
    people: string[];
    /** Owner, artist, photographer and creator names. */
    names: string[];
    software: string[];
    aiPrompt?: string;
  };
  /** Embedded preview pictures (EXIF/IPTC/XMP thumbnails). */
  thumbnails: Uint8Array[];
  /** Extra pictures or video stored in the file next to the main image. */
  hidden: HiddenMedia[];
  notes: string[];
}

export interface StripOptions {
  /** Categories to remove. Defaults to every category whose `defaultRemove` is true. */
  remove?: Category[] | 'all';
}

export interface StripResult {
  bytes: Uint8Array;
  mime: string;
  format: Format;
  /** True when only metadata changed and the picture data is byte-identical. */
  lossless: true;
  /** Categories that were present and are now gone. */
  removed: Category[];
  /** Findings that were requested for removal but could not be removed in this format. */
  retained: Finding[];
  notes: string[];
}

export type Input = Uint8Array | ArrayBuffer | Blob;
