import { describe, expect, it } from 'vitest';
import { inspectFileName, neutralFileName } from '../src/index.js';

const values = (name: string) => inspectFileName(name).findings.map((f) => f.value);

describe('inspectFileName', () => {
  it('reads Pixel names, including the motion-photo marker', () => {
    const v = values('PXL_20241016_103122123.MP.jpg');
    expect(v).toContain('Google Pixel camera');
    expect(v).toContain('2024-10-16 10:31:22');
    expect(v.join(' ')).toMatch(/video/);
  });
  it('reads WhatsApp, Signal, Telegram and screenshots', () => {
    expect(values('WhatsApp Image 2024-10-16 at 10.31.22.jpeg')).toEqual(['WhatsApp', '2024-10-16 10:31:22']);
    expect(values('IMG-20241016-WA0003.jpg')).toEqual(['WhatsApp (Android)', '2024-10-16']);
    expect(values('signal-2024-10-16-103122.jpg')).toContain('Signal');
    expect(values('photo_2024-10-16_10-31-22.jpg')).toContain('Telegram');
    expect(values('Screenshot_20241016-103122_WhatsApp.jpg')).toEqual(['Android screenshot', '2024-10-16 10:31:22', 'WhatsApp']);
    expect(values('Screenshot 2024-10-16 at 10.31.22.png')).toContain('macOS screenshot');
  });
  it('recognises camera numbering', () => {
    expect(values('IMG_20241016_103122.jpg')).toContain('Android phone camera');
    expect(values('20241016_103122.jpg')).toContain('Samsung phone camera');
    expect(values('IMG_1234.HEIC')).toContain('iPhone, iPad or camera numbering');
    expect(values('IMG_E1234.JPG')).toContain('iPhone or iPad camera');
    expect(values('DSC_0042.JPG')).toContain('Nikon camera numbering');
    expect(values('DJI_0001.JPG')).toContain('DJI drone');
  });
  it('flags descriptive names but not generic ones', () => {
    expect(inspectFileName('johns-birthday-goa.jpg').revealing).toBe(true);
    expect(inspectFileName('photo.jpg').revealing).toBe(false);
    expect(inspectFileName('image (3).png').revealing).toBe(false);
    expect(inspectFileName('3f2a9c1e-77b0-4c1d-9a51-0c2d6e8f1b44.jpg').revealing).toBe(false);
  });
  it('builds neutral names', () => {
    expect(neutralFileName('image/heic')).toBe('photo.heic');
    expect(neutralFileName('image/jpeg', 'photo-clean')).toBe('photo-clean.jpg');
  });
});
