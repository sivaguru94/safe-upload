#!/usr/bin/env bash
# Generate small test photos carrying every metadata category. Needs ImageMagick 7, exiftool, heif-enc, python3.
set -euo pipefail
cd "$(dirname "$0")/../fixtures"
rm -f *.jpg *.png *.webp *.heic *.avif *_original
M="magick"

# Base pictures: a 'full' scene and a cropped version of it.
$M -size 192x128 gradient:'#203a60'-'#e0a040' -fill '#f4f4f4' -draw 'circle 140,64 140,30' -fill '#101010' -draw 'rectangle 20,70 70,120' scene.png
$M scene.png -crop 96x96+96+16 +repage crop.png
$M scene.png -resize 96x64 -quality 80 thumb.jpg
$M crop.png -quality 90 base.jpg
cp crop.png base.png
$M crop.png -quality 90 base.webp
heif-enc -q 80 -o base.heic crop.png >/dev/null
heif-enc -A -q 80 -o base.avif crop.png >/dev/null

COMMON=(
  -GPSLatitude=12.971599 -GPSLatitudeRef=N -GPSLongitude=77.594566 -GPSLongitudeRef=E
  -GPSAltitude=920 -GPSAltitudeRef=0 -GPSImgDirection=132 -GPSImgDirectionRef=T
  -GPSDateStamp=2024:09:14 -GPSTimeStamp=13:12:10
  -DateTimeOriginal='2024:09:14 18:42:10' -CreateDate='2024:09:14 18:42:10' -ModifyDate='2024:09:15 09:00:00' -OffsetTimeOriginal=+05:30
  -Make=Google -Model='Pixel 7a' -SerialNumber=SN-7A-123456 -LensModel='Pixel 7a back camera' -LensSerialNumber=LENS-42 -ImageUniqueID=UID0001
  -Artist='Jane Doe' -Copyright='(c) 2024 Jane Doe' -OwnerName='Jane Doe'
  -ImageDescription='Our new flat, 3rd floor' -UserComment='door code 4821' -XPComment='private note'
  -Software='Adobe Photoshop 25.0' -Orientation#=1
  -ExposureTime=1/120 -FNumber=1.9 -ISO=100 -FocalLength=5.4
  -XMP-xmp:CreatorTool='Adobe Lightroom 13' -XMP-dc:Creator='Jane Doe' -XMP-photoshop:City=Bengaluru -XMP-photoshop:Country=India
  -XMP-iptcExt:PersonInImage='John Smith' -XMP-xmpMM:DocumentID=xmp.did:0001 -XMP-photoshop:DocumentAncestors=adobe:docid:photoshop:abc
)

exiftool -q -overwrite_original "${COMMON[@]}" '-ThumbnailImage<=thumb.jpg' \
  -IPTC:By-line='Jane Doe' -IPTC:City=Bengaluru -IPTC:Keywords=home -IPTC:Caption-Abstract='Kids room' \
  -Comment='JPEG comment: spare key under the mat' base.jpg
mv base.jpg full.jpg

# Fake Google motion photo: JPEG + XMP flag + an MP4-shaped trailer.
cp full.jpg motion.jpg
exiftool -q -overwrite_original -XMP-GCamera:MotionPhoto=1 -XMP-GCamera:MotionPhotoVersion=1 motion.jpg
python3 -I - motion.jpg <<'PY'
import struct, sys
mp4 = struct.pack('>I', 24) + b'ftypisom' + b'\x00\x00\x02\x00' + b'isommp41' + struct.pack('>I', 16) + b'free' + b'hidden-video'
open(sys.argv[1], 'ab').write(mp4)
PY

exiftool -q -overwrite_original "${COMMON[@]}" -PNG:Author='Jane Doe' -PNG:Comment='png comment' -PNG:Software='GIMP 2.10' base.png
mv base.png full.png

# PNG written by an AI image generator: a 'parameters' tEXt chunk.
python3 -I - crop.png ai.png <<'PY'
import struct, sys, zlib
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
def chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
text = b'parameters\x00a cozy living room, photo of my house at 14 Elm Street, Steps: 30, Sampler: DPM++ 2M, Seed: 1234'
pos = 8 + 4 + 4 + 13 + 4  # after IHDR
open(dst, 'wb').write(b[:pos] + chunk(b'tEXt', text) + b[pos:])
PY

exiftool -q -overwrite_original "${COMMON[@]}" base.webp && mv base.webp full.webp
exiftool -q -overwrite_original "${COMMON[@]}" base.heic && mv base.heic full.heic
exiftool -q -overwrite_original "${COMMON[@]}" base.avif && mv base.avif full.avif

rm -f scene.png crop.png thumb.jpg
ls -la

# --- Nikon-style cases (added 2026-11-10) -----------------------------------
# A camera without GPS: Nikon still writes a GPS block holding only GPSVersionID.
magick -size 120x80 gradient:'#335533'-'#ddcc99' -quality 85 nogps.jpg
exiftool -q -overwrite_original -Make='NIKON CORPORATION' -Model='NIKON D5600' -Software='Ver.1.10' -GPSVersionID=2.3.0.0 -Orientation#=6 nogps.jpg
# MPF (CIPA DC-007) index pointing at a Full HD preview copy stored after the main image.
magick -size 64x48 gradient:'#aa3333'-'#3333aa' -quality 80 preview.jpg
python3 -I - nogps.jpg preview.jpg mpf.jpg <<'PY'
import struct, sys
main, prev, out = (open(sys.argv[1], 'rb').read(), open(sys.argv[2], 'rb').read(), sys.argv[3])
def entries(main_size, prev_off):
    return (struct.pack('>IIIHH', 0x20030000, main_size, 0, 0, 0) +
            struct.pack('>IIIHH', 0x00010002, len(prev), prev_off, 0, 0))
ifd = struct.pack('>H', 3)
ifd += struct.pack('>HHI', 0xB000, 7, 4) + b'0100'
ifd += struct.pack('>HHII', 0xB001, 4, 1, 2)
ifd += struct.pack('>HHII', 0xB002, 7, 32, 8 + 2 + 3 * 12 + 4)
ifd += struct.pack('>I', 0)
def build(main_size, prev_off):
    tiff = b'MM\x00\x2a' + struct.pack('>I', 8) + ifd + entries(main_size, prev_off)
    payload = b'MPF\x00' + tiff
    return b'\xff\xe2' + struct.pack('>H', len(payload) + 2) + payload
seg_len = len(build(0, 0))
main_size = len(main) + seg_len
tiff_abs = 2 + 4 + 4
data = main[:2] + build(main_size, main_size - tiff_abs) + main[2:] + prev
open(out, 'wb').write(data)
PY
rm -f preview.jpg
