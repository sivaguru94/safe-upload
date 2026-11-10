import type { Category, Finding, GpsPoint, Source } from './types.js';

/** Namespace URI → per-property classification. '*' is the namespace default. */
const NS: Record<string, Record<string, Category | 'technical'>> = {
  'http://ns.adobe.com/exif/1.0/': {
    '*': 'settings',
    DateTimeOriginal: 'time',
    DateTimeDigitized: 'time',
    OffsetTime: 'time',
    OffsetTimeOriginal: 'time',
    OffsetTimeDigitized: 'time',
    SubSecTimeOriginal: 'time',
    GPSTimeStamp: 'time',
    UserComment: 'descriptions',
    PixelXDimension: 'technical',
    PixelYDimension: 'technical',
    ColorSpace: 'technical',
    ExifVersion: 'technical',
    ImageUniqueID: 'device',
    CameraOwnerName: 'author',
    BodySerialNumber: 'device',
    LensSerialNumber: 'device',
    LensMake: 'device',
    LensModel: 'device',
  },
  'http://cipa.jp/exif/1.0/': {
    '*': 'settings',
    BodySerialNumber: 'device',
    LensSerialNumber: 'device',
    LensMake: 'device',
    LensModel: 'device',
    LensSpecification: 'device',
    CameraOwnerName: 'author',
    Photographer: 'author',
    ImageUniqueID: 'device',
    OffsetTime: 'time',
    OffsetTimeOriginal: 'time',
  },
  'http://ns.adobe.com/tiff/1.0/': {
    '*': 'technical',
    Make: 'device',
    Model: 'device',
    DateTime: 'time',
    Artist: 'author',
    Copyright: 'author',
    Software: 'software',
    ImageDescription: 'descriptions',
  },
  'http://ns.adobe.com/exif/1.0/aux/': {
    '*': 'device',
    OwnerName: 'author',
    ApproximateFocusDistance: 'settings',
    Firmware: 'device',
  },
  'http://ns.adobe.com/xap/1.0/': {
    '*': 'other',
    CreateDate: 'time',
    ModifyDate: 'time',
    MetadataDate: 'time',
    CreatorTool: 'software',
    Rating: 'descriptions',
    Label: 'descriptions',
    Nickname: 'author',
    Thumbnails: 'thumbnail',
  },
  'http://ns.adobe.com/xap/1.0/mm/': { '*': 'history' },
  'http://ns.adobe.com/xap/1.0/sType/ResourceEvent#': { '*': 'history' },
  'http://ns.adobe.com/camera-raw-settings/1.0/': { '*': 'history' },
  'http://ns.adobe.com/lightroom/1.0/': { '*': 'descriptions' },
  'http://ns.adobe.com/photoshop/1.0/': {
    '*': 'other',
    City: 'location',
    State: 'location',
    Country: 'location',
    DateCreated: 'time',
    DocumentAncestors: 'history',
    History: 'history',
    AuthorsPosition: 'author',
    CaptionWriter: 'author',
    Credit: 'author',
    Source: 'author',
    Headline: 'descriptions',
    Instructions: 'descriptions',
    TransmissionReference: 'descriptions',
    Category: 'descriptions',
    SupplementalCategories: 'descriptions',
    ColorMode: 'technical',
    ICCProfile: 'technical',
  },
  'http://purl.org/dc/elements/1.1/': {
    '*': 'descriptions',
    creator: 'author',
    rights: 'author',
    publisher: 'author',
    contributor: 'author',
    format: 'technical',
  },
  'http://ns.adobe.com/xap/1.0/rights/': { '*': 'author' },
  'http://ns.useplus.org/ldf/xmp/1.0/': { '*': 'author' },
  'http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/': {
    '*': 'descriptions',
    Location: 'location',
    CountryCode: 'location',
    CreatorContactInfo: 'author',
  },
  'http://iptc.org/std/Iptc4xmpExt/2008-02-29/': {
    '*': 'descriptions',
    LocationCreated: 'location',
    LocationShown: 'location',
    PersonInImage: 'people',
    PersonInImageWDetails: 'people',
    ArtworkOrObject: 'descriptions',
    DigitalSourceType: 'ai',
  },
  'http://www.metadataworkinggroup.com/schemas/regions/': { '*': 'people' },
  'http://ns.microsoft.com/photo/1.2/': { '*': 'people' },
  'http://ns.microsoft.com/photo/1.0/': { '*': 'descriptions' },
  'http://ns.google.com/photos/1.0/camera/': { '*': 'hidden' },
  'http://ns.google.com/photos/1.0/container/': { '*': 'hidden' },
  'http://ns.google.com/photos/1.0/container/item/': { '*': 'hidden' },
  'http://ns.google.com/photos/1.0/depthmap/': { '*': 'hidden' },
  'http://ns.google.com/photos/1.0/image/': { '*': 'hidden' },
  'http://ns.google.com/photos/1.0/panorama/': { '*': 'settings' },
  'http://ns.adobe.com/hdr-gain-map/1.0/': { '*': 'hidden' },
  'http://ns.apple.com/HDRGainMap/1.0/': { '*': 'hidden' },
  'http://ns.apple.com/ImageIO/1.0/': { '*': 'other' },
  'http://ns.apple.com/pixeldatainfo/1.0/': { '*': 'hidden' },
  'http://ns.adobe.com/xmp/1.0/DynamicMedia/': { '*': 'other' },
  'http://ns.adobe.com/pdf/1.3/': { '*': 'software', Keywords: 'descriptions' },
  'http://ns.adobe.com/xmp/note/': { '*': 'technical' },
  'http://c2pa.org/': { '*': 'provenance' },
};

/** Container namespaces whose elements are structure, not properties. */
const STRUCTURAL = new Set(['http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'adobe:ns:meta/', 'http://www.w3.org/XML/1998/namespace']);

export interface XmpProperty {
  ns: string;
  name: string;
  value: string;
  category: Category;
}

export interface XmpAnalysis {
  properties: XmpProperty[];
  categories: Set<Category>;
  gps?: GpsPoint;
  people: string[];
  names: string[];
  software: string[];
  motionPhoto: boolean;
  /** Byte length of the motion-photo video at the end of the file, when declared. */
  motionVideoLength?: number;
  aiPrompt?: string;
}

interface Tok {
  kind: 'open' | 'close' | 'text';
  name?: string;
  attrs?: Record<string, string>;
  selfClosing?: boolean;
  text?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function* tokenize(xml: string): Generator<Tok> {
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) yield { kind: 'text', text: m[1] };
    else if (m[2]) yield { kind: 'close', name: m[2] };
    else if (m[3]) {
      const attrs: Record<string, string> = {};
      const ar = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = ar.exec(m[4] ?? ''))) attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? '');
      yield { kind: 'open', name: m[3], attrs, selfClosing: m[5] === '/' };
    } else if (m[6] !== undefined) yield { kind: 'text', text: decodeEntities(m[6]) };
  }
}

export function classifyXmp(ns: string, name: string): Category | 'technical' {
  const map = NS[ns];
  if (!map) return 'other';
  return map[name] ?? map['*'] ?? 'other';
}

/** Parse an XMP packet into top-level properties with categories and a few summaries. */
export function analyzeXmp(xml: string): XmpAnalysis {
  const prefixes = new Map<string, string>([['xml', 'http://www.w3.org/XML/1998/namespace']]);
  for (const m of xml.matchAll(/xmlns:([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) prefixes.set(m[1], m[2] ?? m[3] ?? '');
  const split = (q: string): [string, string] => {
    const i = q.indexOf(':');
    if (i < 0) return ['', q];
    return [prefixes.get(q.slice(0, i)) ?? 'urn:unknown:' + q.slice(0, i), q.slice(i + 1)];
  };

  const out: XmpAnalysis = { properties: [], categories: new Set(), people: [], names: [], software: [], motionPhoto: false };
  const add = (ns: string, name: string, value: string) => {
    if (STRUCTURAL.has(ns)) return;
    const cls = classifyXmp(ns, name);
    if (cls === 'technical') return;
    out.properties.push({ ns, name, value, category: cls });
    out.categories.add(cls);
  };

  // Stack frames: element qname + role.
  type Frame = { q: string; role: 'rdf' | 'desc' | 'prop' | 'inner'; prop?: { ns: string; name: string; texts: string[]; items: number } };
  const stack: Frame[] = [];
  const currentProp = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].prop) return stack[i].prop;
    return undefined;
  };
  const finish = (p: NonNullable<Frame['prop']>) => {
    const texts = p.texts.map((t) => t.trim()).filter(Boolean);
    let value = texts.join(', ');
    if (p.items > 1 && texts.length === 0) value = `${p.items} entries`;
    else if (p.items > 3 && value.length > 160) value = `${p.items} entries: ${value.slice(0, 160)}…`;
    else if (value.length > 300) value = value.slice(0, 300) + '…';
    add(p.ns, p.name, value);
    collect(p.ns, p.name, texts);
  };
  const collect = (ns: string, name: string, texts: string[]) => {
    const cls = classifyXmp(ns, name);
    if (cls === 'people') out.people.push(...texts.filter((t) => t.length < 120));
    if (cls === 'author' && (name === 'creator' || name === 'Artist' || name === 'OwnerName' || name === 'CameraOwnerName')) out.names.push(...texts);
    if (name === 'CreatorTool' || (ns === 'http://ns.adobe.com/tiff/1.0/' && name === 'Software')) out.software.push(...texts);
    if (ns === 'http://ns.google.com/photos/1.0/camera/') {
      if ((name === 'MotionPhoto' || name === 'MicroVideo') && texts[0] === '1') out.motionPhoto = true;
      if (name === 'MicroVideoOffset') {
        const n = Number(texts[0]);
        if (n > 0) out.motionVideoLength = n;
      }
    }
  };

  for (const tok of tokenize(xml)) {
    if (tok.kind === 'text') {
      const p = currentProp();
      if (p && tok.text && tok.text.trim()) p.texts.push(tok.text);
      continue;
    }
    if (tok.kind === 'close') {
      const f = stack.pop();
      if (f?.prop && f.role === 'prop') finish(f.prop);
      continue;
    }
    const q = tok.name!;
    const [ns, local] = split(q);
    const parent = stack[stack.length - 1];
    let frame: Frame;
    if (ns === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' && local === 'RDF') frame = { q, role: 'rdf' };
    else if (ns === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' && local === 'Description' && parent?.role === 'rdf') frame = { q, role: 'desc' };
    else if (parent?.role === 'desc') frame = { q, role: 'prop', prop: { ns, name: local, texts: [], items: 0 } };
    else frame = { q, role: 'inner' };

    // Attributes: on a top-level description they are properties; deeper they are values.
    for (const [k, v] of Object.entries(tok.attrs ?? {})) {
      if (k.startsWith('xmlns') || k === 'rdf:about' || k === 'rdf:parseType' || k === 'xml:lang' || k.startsWith('x:')) continue;
      const [ans, alocal] = split(k);
      if (frame.role === 'desc') {
        add(ans, alocal, v.length > 300 ? v.slice(0, 300) + '…' : v);
        collect(ans, alocal, [v]);
      } else {
        const p = frame.prop ?? currentProp();
        if (p && v) p.texts.push(`${alocal}: ${v}`);
        if (ans === 'http://ns.google.com/photos/1.0/container/item/' && alocal === 'Length') {
          const mime = tok.attrs?.[Object.keys(tok.attrs).find((x) => x.endsWith(':Mime')) ?? ''];
          if (mime?.startsWith('video/')) out.motionVideoLength = Number(v) || out.motionVideoLength;
        }
      }
    }
    if (q.endsWith(':li')) {
      const p = currentProp();
      if (p) p.items++;
    }
    if (tok.selfClosing) {
      if (frame.prop) finish(frame.prop);
      continue;
    }
    stack.push(frame);
  }

  // GPS from exif:GPSLatitude="12,58.1234N"
  const gpsVal = (name: string) => out.properties.find((p) => p.ns === 'http://ns.adobe.com/exif/1.0/' && p.name === name)?.value;
  const lat = parseXmpCoord(gpsVal('GPSLatitude'));
  const lon = parseXmpCoord(gpsVal('GPSLongitude'));
  if (lat !== undefined && lon !== undefined) out.gps = { latitude: lat, longitude: lon };
  for (const p of out.properties) if (p.ns === 'http://ns.adobe.com/exif/1.0/' && p.name.startsWith('GPS') && p.name !== 'GPSTimeStamp') {
    p.category = 'location';
    out.categories.add('location');
  }
  return out;
}

function parseXmpCoord(v?: string): number | undefined {
  if (!v) return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*([NSEW])\s*$/i.exec(v);
  if (!m) return undefined;
  let deg = Number(m[1]) + Number(m[2]) / 60 + (m[3] ? Number(m[3]) / 3600 : 0);
  if (/[SW]/i.test(m[4])) deg = -deg;
  return deg;
}

const PRETTY: Record<string, string> = {
  CreatorTool: 'Created with',
  CreateDate: 'Created',
  ModifyDate: 'Modified',
  MetadataDate: 'Metadata modified',
  History: 'Edit history',
  DocumentID: 'Document ID',
  InstanceID: 'Instance ID',
  OriginalDocumentID: 'Original document ID',
  DerivedFrom: 'Derived from',
  DocumentAncestors: 'Source documents',
  creator: 'Creator',
  rights: 'Rights',
  title: 'Title',
  description: 'Description',
  subject: 'Keywords',
  MotionPhoto: 'Motion photo',
  MicroVideo: 'Motion photo (legacy)',
  MicroVideoOffset: 'Motion video size',
  MotionPhotoPresentationTimestampUs: 'Motion photo frame time',
  Directory: 'Embedded items',
  Regions: 'Face regions',
  RegionInfo: 'Tagged regions',
  PersonInImage: 'People in image',
  SerialNumber: 'Camera serial number',
  LensSerialNumber: 'Lens serial number',
  City: 'City',
  State: 'State',
  Country: 'Country',
  Location: 'Location',
  GPSLatitude: 'GPS latitude',
  GPSLongitude: 'GPS longitude',
  GPSAltitude: 'GPS altitude',
};

export function xmpFindings(a: XmpAnalysis, source: Source, removable = true): Finding[] {
  return a.properties.map((p) => ({
    category: p.category,
    source,
    key: `xmp.${p.name}`,
    label: PRETTY[p.name] ?? p.name.replace(/([a-z])([A-Z])/g, '$1 $2'),
    value: p.value || '(present)',
    removable,
  }));
}

/** An empty but valid XMP packet, padded with spaces to an exact byte length when possible. */
export function emptyXmpPacket(length: number): Uint8Array {
  const head = "<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?><x:xmpmeta xmlns:x='adobe:ns:meta/'/>";
  const tail = "<?xpacket end='w'?>";
  const min = head.length + tail.length;
  if (length < min) return new Uint8Array(length).fill(0x20);
  const s = head + ' '.repeat(length - min) + tail;
  const out = new Uint8Array(length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
