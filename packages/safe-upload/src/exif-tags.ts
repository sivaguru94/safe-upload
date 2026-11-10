import type { Category } from './types.js';

/** 'technical' tags are needed to display the image correctly and are never removed. */
export type TagClass = Category | 'technical';
export type IfdName = 'ifd0' | 'exif' | 'gps' | 'interop' | 'ifd1';

interface TagDef {
  name: string;
  label: string;
  cls: TagClass;
}

const t = (name: string, label: string, cls: TagClass): TagDef => ({ name, label, cls });

/** IFD0 (also used for IFD1 lookups of shared tags). */
export const IFD0_TAGS: Record<number, TagDef> = {
  0x0100: t('ImageWidth', 'Image width', 'technical'),
  0x0101: t('ImageHeight', 'Image height', 'technical'),
  0x0102: t('BitsPerSample', 'Bits per sample', 'technical'),
  0x0103: t('Compression', 'Compression', 'technical'),
  0x0106: t('PhotometricInterpretation', 'Photometric interpretation', 'technical'),
  0x010e: t('ImageDescription', 'Image description', 'descriptions'),
  0x010f: t('Make', 'Camera make', 'device'),
  0x0110: t('Model', 'Camera model', 'device'),
  0x0112: t('Orientation', 'Orientation', 'technical'),
  0x0115: t('SamplesPerPixel', 'Samples per pixel', 'technical'),
  0x011a: t('XResolution', 'X resolution', 'technical'),
  0x011b: t('YResolution', 'Y resolution', 'technical'),
  0x011c: t('PlanarConfiguration', 'Planar configuration', 'technical'),
  0x0128: t('ResolutionUnit', 'Resolution unit', 'technical'),
  0x012d: t('TransferFunction', 'Transfer function', 'technical'),
  0x0131: t('Software', 'Software', 'software'),
  0x0132: t('DateTime', 'Modified', 'time'),
  0x013b: t('Artist', 'Artist', 'author'),
  0x013c: t('HostComputer', 'Computer name', 'device'),
  0x013e: t('WhitePoint', 'White point', 'technical'),
  0x013f: t('PrimaryChromaticities', 'Primary chromaticities', 'technical'),
  0x0201: t('JPEGInterchangeFormat', 'Thumbnail offset', 'thumbnail'),
  0x0202: t('JPEGInterchangeFormatLength', 'Thumbnail length', 'thumbnail'),
  0x0211: t('YCbCrCoefficients', 'YCbCr coefficients', 'technical'),
  0x0212: t('YCbCrSubSampling', 'YCbCr subsampling', 'technical'),
  0x0213: t('YCbCrPositioning', 'YCbCr positioning', 'technical'),
  0x0214: t('ReferenceBlackWhite', 'Reference black/white', 'technical'),
  0x02bc: t('ApplicationNotes', 'Embedded XMP', 'history'),
  0x4746: t('Rating', 'Rating', 'descriptions'),
  0x4749: t('RatingPercent', 'Rating percent', 'descriptions'),
  0x8298: t('Copyright', 'Copyright', 'author'),
  0x83bb: t('IPTC-NAA', 'Embedded IPTC', 'descriptions'),
  0x8649: t('PhotoshopSettings', 'Photoshop data', 'history'),
  0x8773: t('ICCProfile', 'Colour profile', 'technical'),
  0x9c9b: t('XPTitle', 'Title', 'descriptions'),
  0x9c9c: t('XPComment', 'Comment', 'descriptions'),
  0x9c9d: t('XPAuthor', 'Author', 'author'),
  0x9c9e: t('XPKeywords', 'Keywords', 'descriptions'),
  0x9c9f: t('XPSubject', 'Subject', 'descriptions'),
  0xa480: t('GDALMetadata', 'GDAL metadata', 'other'),
  0xc4a5: t('PrintIM', 'Print settings', 'software'),
  0xc614: t('UniqueCameraModel', 'Unique camera model', 'device'),
  0xc62f: t('CameraSerialNumber', 'Camera serial number', 'device'),
  0xea1c: t('Padding', 'Padding', 'technical'),
  0xea1d: t('OffsetSchema', 'Offset schema', 'technical'),
};

export const EXIF_TAGS: Record<number, TagDef> = {
  0x829a: t('ExposureTime', 'Exposure time', 'settings'),
  0x829d: t('FNumber', 'Aperture', 'settings'),
  0x8822: t('ExposureProgram', 'Exposure program', 'settings'),
  0x8824: t('SpectralSensitivity', 'Spectral sensitivity', 'settings'),
  0x8827: t('ISO', 'ISO', 'settings'),
  0x8828: t('OECF', 'OECF', 'settings'),
  0x8830: t('SensitivityType', 'Sensitivity type', 'settings'),
  0x8831: t('StandardOutputSensitivity', 'Standard output sensitivity', 'settings'),
  0x8832: t('RecommendedExposureIndex', 'Recommended exposure index', 'settings'),
  0x9000: t('ExifVersion', 'EXIF version', 'technical'),
  0x9003: t('DateTimeOriginal', 'Taken', 'time'),
  0x9004: t('DateTimeDigitized', 'Digitised', 'time'),
  0x9010: t('OffsetTime', 'Time zone (modified)', 'time'),
  0x9011: t('OffsetTimeOriginal', 'Time zone', 'time'),
  0x9012: t('OffsetTimeDigitized', 'Time zone (digitised)', 'time'),
  0x9101: t('ComponentsConfiguration', 'Components configuration', 'technical'),
  0x9102: t('CompressedBitsPerPixel', 'Compressed bits per pixel', 'technical'),
  0x9201: t('ShutterSpeedValue', 'Shutter speed', 'settings'),
  0x9202: t('ApertureValue', 'Aperture value', 'settings'),
  0x9203: t('BrightnessValue', 'Brightness', 'settings'),
  0x9204: t('ExposureBiasValue', 'Exposure bias', 'settings'),
  0x9205: t('MaxApertureValue', 'Max aperture', 'settings'),
  0x9206: t('SubjectDistance', 'Subject distance', 'settings'),
  0x9207: t('MeteringMode', 'Metering mode', 'settings'),
  0x9208: t('LightSource', 'Light source', 'settings'),
  0x9209: t('Flash', 'Flash', 'settings'),
  0x920a: t('FocalLength', 'Focal length', 'settings'),
  0x9214: t('SubjectArea', 'Subject area', 'settings'),
  0x927c: t('MakerNote', 'Maker note (vendor data, often includes serial numbers)', 'device'),
  0x9286: t('UserComment', 'User comment', 'descriptions'),
  0x9290: t('SubSecTime', 'Sub-second time', 'time'),
  0x9291: t('SubSecTimeOriginal', 'Sub-second time (taken)', 'time'),
  0x9292: t('SubSecTimeDigitized', 'Sub-second time (digitised)', 'time'),
  0x9400: t('AmbientTemperature', 'Ambient temperature', 'settings'),
  0x9401: t('Humidity', 'Humidity', 'settings'),
  0x9402: t('Pressure', 'Air pressure', 'settings'),
  0x9403: t('WaterDepth', 'Water depth', 'settings'),
  0x9404: t('Acceleration', 'Acceleration', 'settings'),
  0x9405: t('CameraElevationAngle', 'Camera elevation angle', 'settings'),
  0xa000: t('FlashpixVersion', 'Flashpix version', 'technical'),
  0xa001: t('ColorSpace', 'Colour space', 'technical'),
  0xa002: t('PixelXDimension', 'Pixel width', 'technical'),
  0xa003: t('PixelYDimension', 'Pixel height', 'technical'),
  0xa004: t('RelatedSoundFile', 'Related sound file', 'other'),
  0xa20b: t('FlashEnergy', 'Flash energy', 'settings'),
  0xa20e: t('FocalPlaneXResolution', 'Focal plane X resolution', 'settings'),
  0xa20f: t('FocalPlaneYResolution', 'Focal plane Y resolution', 'settings'),
  0xa210: t('FocalPlaneResolutionUnit', 'Focal plane resolution unit', 'settings'),
  0xa214: t('SubjectLocation', 'Subject location', 'settings'),
  0xa215: t('ExposureIndex', 'Exposure index', 'settings'),
  0xa217: t('SensingMethod', 'Sensing method', 'settings'),
  0xa300: t('FileSource', 'File source', 'settings'),
  0xa301: t('SceneType', 'Scene type', 'settings'),
  0xa302: t('CFAPattern', 'CFA pattern', 'settings'),
  0xa401: t('CustomRendered', 'Custom rendered', 'settings'),
  0xa402: t('ExposureMode', 'Exposure mode', 'settings'),
  0xa403: t('WhiteBalance', 'White balance', 'settings'),
  0xa404: t('DigitalZoomRatio', 'Digital zoom', 'settings'),
  0xa405: t('FocalLengthIn35mmFormat', 'Focal length (35 mm)', 'settings'),
  0xa406: t('SceneCaptureType', 'Scene capture type', 'settings'),
  0xa407: t('GainControl', 'Gain control', 'settings'),
  0xa408: t('Contrast', 'Contrast', 'settings'),
  0xa409: t('Saturation', 'Saturation', 'settings'),
  0xa40a: t('Sharpness', 'Sharpness', 'settings'),
  0xa40b: t('DeviceSettingDescription', 'Device setting description', 'settings'),
  0xa40c: t('SubjectDistanceRange', 'Subject distance range', 'settings'),
  0xa420: t('ImageUniqueID', 'Image unique ID', 'device'),
  0xa430: t('CameraOwnerName', 'Camera owner name', 'author'),
  0xa431: t('BodySerialNumber', 'Camera serial number', 'device'),
  0xa432: t('LensSpecification', 'Lens specification', 'device'),
  0xa433: t('LensMake', 'Lens make', 'device'),
  0xa434: t('LensModel', 'Lens model', 'device'),
  0xa435: t('LensSerialNumber', 'Lens serial number', 'device'),
  0xa436: t('ImageTitle', 'Image title', 'descriptions'),
  0xa437: t('Photographer', 'Photographer', 'author'),
  0xa438: t('ImageEditor', 'Image editor', 'author'),
  0xa439: t('CameraFirmware', 'Camera firmware', 'device'),
  0xa43a: t('RAWDevelopingSoftware', 'RAW developing software', 'software'),
  0xa43b: t('ImageEditingSoftware', 'Image editing software', 'software'),
  0xa43c: t('MetadataEditingSoftware', 'Metadata editing software', 'software'),
  0xa460: t('CompositeImage', 'Composite image', 'settings'),
  0xa461: t('CompositeImageCount', 'Composite image count', 'settings'),
  0xa462: t('CompositeImageExposureTimes', 'Composite exposure times', 'settings'),
  0xa500: t('Gamma', 'Gamma', 'technical'),
};

export const GPS_TAGS: Record<number, TagDef> = {
  0x0000: t('GPSVersionID', 'GPS version', 'location'),
  0x0001: t('GPSLatitudeRef', 'GPS latitude reference', 'location'),
  0x0002: t('GPSLatitude', 'GPS latitude', 'location'),
  0x0003: t('GPSLongitudeRef', 'GPS longitude reference', 'location'),
  0x0004: t('GPSLongitude', 'GPS longitude', 'location'),
  0x0005: t('GPSAltitudeRef', 'GPS altitude reference', 'location'),
  0x0006: t('GPSAltitude', 'GPS altitude', 'location'),
  0x0007: t('GPSTimeStamp', 'GPS time (UTC)', 'time'),
  0x0008: t('GPSSatellites', 'GPS satellites', 'location'),
  0x0009: t('GPSStatus', 'GPS status', 'location'),
  0x000a: t('GPSMeasureMode', 'GPS measure mode', 'location'),
  0x000b: t('GPSDOP', 'GPS precision', 'location'),
  0x000c: t('GPSSpeedRef', 'GPS speed unit', 'location'),
  0x000d: t('GPSSpeed', 'Speed', 'location'),
  0x000e: t('GPSTrackRef', 'GPS track reference', 'location'),
  0x000f: t('GPSTrack', 'Direction of travel', 'location'),
  0x0010: t('GPSImgDirectionRef', 'Camera direction reference', 'location'),
  0x0011: t('GPSImgDirection', 'Camera facing', 'location'),
  0x0012: t('GPSMapDatum', 'GPS map datum', 'location'),
  0x0013: t('GPSDestLatitudeRef', 'Destination latitude reference', 'location'),
  0x0014: t('GPSDestLatitude', 'Destination latitude', 'location'),
  0x0015: t('GPSDestLongitudeRef', 'Destination longitude reference', 'location'),
  0x0016: t('GPSDestLongitude', 'Destination longitude', 'location'),
  0x0017: t('GPSDestBearingRef', 'Destination bearing reference', 'location'),
  0x0018: t('GPSDestBearing', 'Destination bearing', 'location'),
  0x0019: t('GPSDestDistanceRef', 'Destination distance unit', 'location'),
  0x001a: t('GPSDestDistance', 'Destination distance', 'location'),
  0x001b: t('GPSProcessingMethod', 'GPS processing method', 'location'),
  0x001c: t('GPSAreaInformation', 'GPS area information', 'location'),
  0x001d: t('GPSDateStamp', 'GPS date (UTC)', 'time'),
  0x001e: t('GPSDifferential', 'GPS differential', 'location'),
  0x001f: t('GPSHPositioningError', 'GPS horizontal error', 'location'),
};

export const INTEROP_TAGS: Record<number, TagDef> = {
  0x0001: t('InteropIndex', 'Interoperability index', 'technical'),
  0x0002: t('InteropVersion', 'Interoperability version', 'technical'),
  0x1000: t('RelatedImageFileFormat', 'Related image format', 'technical'),
  0x1001: t('RelatedImageWidth', 'Related image width', 'technical'),
  0x1002: t('RelatedImageHeight', 'Related image height', 'technical'),
};

export const POINTER_TAGS = { exif: 0x8769, gps: 0x8825, interop: 0xa005 } as const;

export function tagDef(ifd: IfdName, tag: number): TagDef | undefined {
  switch (ifd) {
    case 'ifd0':
    case 'ifd1':
      return IFD0_TAGS[tag];
    case 'exif':
      return EXIF_TAGS[tag];
    case 'gps':
      return GPS_TAGS[tag];
    case 'interop':
      return INTEROP_TAGS[tag];
  }
}

/** Classify a tag. Everything in IFD1 belongs to the embedded thumbnail. */
export function classifyTag(ifd: IfdName, tag: number): TagClass {
  if (ifd === 'ifd1') return 'thumbnail';
  if (ifd === 'gps') return GPS_TAGS[tag]?.cls ?? 'location';
  if (ifd === 'interop') return 'technical';
  return tagDef(ifd, tag)?.cls ?? 'other';
}
