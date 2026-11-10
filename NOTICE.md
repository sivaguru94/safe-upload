# Third-party material

The `safe-upload` npm package has no runtime dependencies. The demo site bundles or serves:

| What | Source | Licence |
|------|--------|---------|
| Face detection runtime (`@mediapipe/tasks-vision`) | Google MediaPipe | Apache-2.0 |
| BlazeFace full-range face model (`blaze_face_full_range.tflite`) | Google MediaPipe | Apache-2.0 |
| EfficientDet-Lite0 object model (`efficientdet_lite0.tflite`, int8, COCO classes) | Google MediaPipe | Apache-2.0 |
| Place names (`site/public/geo/cities.tsv`, cities with 15,000+ people) | [GeoNames](https://www.geonames.org) | CC BY 4.0 |
| World outline (`site/src/data/worldmap.ts`, 1:110m land) | [Natural Earth](https://www.naturalearthdata.com) | Public domain |
| Sample photo (`site/public/sample/crew.jpg`), Expedition 75 crew portrait, cropped | NASA/Josh Valcarcel | Public domain (NASA media). The metadata in the sample was added by this project as an example; it is not NASA's. |
