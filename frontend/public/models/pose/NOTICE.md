# Pose model notice

`pose_landmarker_lite.task` is Google's MediaPipe **Pose Landmarker (lite, float16)** model,
licensed under the **Apache License 2.0** (https://www.apache.org/licenses/LICENSE-2.0).
Model card and terms: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker

Provenance: copied from the MIT-licensed npm package `pose-landmarker-react-native@0.1.0`, which
re-bundles the file, because storage.googleapis.com could not be reached when this project was
built. It is a valid `.task` bundle (two TFLite models, 5,777,746 bytes), but byte-identity with
Google's own download has NOT been verified. Verify with `npm run verify:pose-model` from
`frontend/`, or simply replace the file with the official download:

    curl -L -o public/models/pose/pose_landmarker_lite.task \
      https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task

The model only returns body landmark positions. It does not measure the body and is not accurate
enough on its own to size clothes.
