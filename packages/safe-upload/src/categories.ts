import type { Category, Risk } from './types.js';

export interface CategoryInfo {
  label: string;
  risk: Risk;
  description: string;
  defaultRemove: boolean;
}

/** Display order, most revealing first. */
export const CATEGORY_ORDER: Category[] = [
  'location',
  'people',
  'hidden',
  'thumbnail',
  'author',
  'device',
  'time',
  'ai',
  'descriptions',
  'history',
  'software',
  'other',
  'provenance',
  'settings',
];

export const CATEGORY_INFO: Record<Category, CategoryInfo> = {
  location: {
    label: 'Location',
    risk: 'high',
    description: 'GPS coordinates and place names of where the photo was taken.',
    defaultRemove: true,
  },
  people: {
    label: 'Named people',
    risk: 'high',
    description: 'Names of people tagged in the photo by photo apps.',
    defaultRemove: true,
  },
  hidden: {
    label: 'Hidden extra media',
    risk: 'high',
    description:
      'Extra pictures or video stored after the main image, such as motion-photo clips, depth maps and HDR gain maps.',
    defaultRemove: true,
  },
  thumbnail: {
    label: 'Embedded preview',
    risk: 'high',
    description:
      'A small copy of the picture stored inside the file. After cropping or editing it can still show the original.',
    defaultRemove: true,
  },
  author: {
    label: 'Names & copyright',
    risk: 'high',
    description: 'Owner, artist or photographer names, copyright notices and contact details.',
    defaultRemove: true,
  },
  device: {
    label: 'Camera & device',
    risk: 'medium',
    description: 'Phone or camera make and model, lens, and serial numbers that link photos to one device.',
    defaultRemove: true,
  },
  time: {
    label: 'Date & time',
    risk: 'medium',
    description: 'When the photo was taken or edited, including your time zone.',
    defaultRemove: true,
  },
  ai: {
    label: 'AI generation data',
    risk: 'medium',
    description: 'Prompts, settings and workflows saved by image generators.',
    defaultRemove: true,
  },
  descriptions: {
    label: 'Titles & comments',
    risk: 'medium',
    description: 'Captions, keywords, titles, ratings and comments written into the file.',
    defaultRemove: true,
  },
  history: {
    label: 'Edit history',
    risk: 'medium',
    description: 'Editing steps, editor settings and IDs of the documents this image was made from.',
    defaultRemove: true,
  },
  software: {
    label: 'Software',
    risk: 'low',
    description: 'Apps and versions used to create or edit the photo.',
    defaultRemove: true,
  },
  other: {
    label: 'Other metadata',
    risk: 'low',
    description: 'Vendor-specific or unrecognised metadata blocks.',
    defaultRemove: true,
  },
  provenance: {
    label: 'Content credentials',
    risk: 'low',
    description:
      'C2PA provenance data describing how the image was made. Removing it is allowed but breaks verification.',
    defaultRemove: false,
  },
  settings: {
    label: 'Camera settings',
    risk: 'low',
    description: 'Exposure, aperture, ISO and focal length. Rarely sensitive.',
    defaultRemove: false,
  },
};

export const DEFAULT_REMOVE: Category[] = CATEGORY_ORDER.filter((c) => CATEGORY_INFO[c].defaultRemove);

export function resolveRemove(remove: Category[] | 'all' | undefined): Set<Category> {
  if (remove === 'all') return new Set(CATEGORY_ORDER);
  return new Set(remove ?? DEFAULT_REMOVE);
}

export function sortCategories(set: Iterable<Category>): Category[] {
  const s = new Set(set);
  return CATEGORY_ORDER.filter((c) => s.has(c));
}
