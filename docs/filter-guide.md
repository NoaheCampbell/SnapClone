Expo Go Camera Filter Fix Guide

Goal: Replace native-only filter components (e.g. <CMIFColorMatrixImageFilter>) with solutions that run inside stock Expo Go and still let you save filtered snaps.

⸻

Why the native filter crashes

Library	Why it fails in Expo Go
react-native-color-matrix-image-filters@react-native-image-filter-kit	They register custom native views. Expo Go doesn’t include those modules, so it renders a placeholder and throws when you capture.


⸻

Two Expo-Go-safe approaches

Option	Live preview?	Capture path	When to pick
A GPU shader (gl-react-expo)	✅ Yes (60 fps)	captureRef(<Surface>)	Snapchat-like experience; small GLSL snippet.
B Post-capture edit (expo-image-manipulator)	❌ No	manipulateAsync(uri,[{ invert:true }])	Quickest code; user sees filter after the shot.


⸻

Option A – Live Invert / B&W with gl-react-expo

1 Install (one time)

expo install gl-react gl-react-expo expo-media-library

2 Filter component  src/components/InvertedPreview.tsx

import { Surface } from 'gl-react-expo';
import { Shaders, Node, GLSL } from 'gl-react';

const shaders = Shaders.create({
  Invert: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform sampler2D t;
void main () {
  vec4 c = texture2D(t, uv);
  gl_FragColor = vec4(vec3(1.0) - c.rgb, c.a);
}`
  },
  Grayscale: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform sampler2D t;
void main () {
  vec4 c = texture2D(t, uv);
  float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(vec3(g), c.a);
}`
  }
});

export function Inverted({ uri, width, height, innerRef }: any) {
  return (
    <Surface ref={innerRef} style={{ width, height }} preload>
      <Node shader={shaders.Invert} uniforms={{ t: uri }} />
    </Surface>
  );
}

3 Camera screen snippet

import { Camera } from 'react-native-vision-camera';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { Inverted } from '@/components/InvertedPreview';

const camRef = useRef<Camera>(null);
const surfRef = useRef(null);
const [photoUri, setPhotoUri] = useState<string|null>(null);

async function snap() {
  const p = await camRef.current?.takePhoto({ qualityPrioritization:'speed' });
  const rawUri = 'file://' + p.path;
  setPhotoUri(rawUri);               // show live shader

  setTimeout(async ()=>{
    const filtered = await captureRef(surfRef, { format:'png', quality:1 });
    await MediaLibrary.saveToLibraryAsync(filtered);
  }, 300);                            // wait for GL draw
}

4 Common pitfalls
	•	Blank capture → make sure you pass surfRef (the <Surface>) to captureRef.
	•	White screen during remote-JS debug → stop “Debug Remote JS”; WebGL disabled there.

⸻

Option B – Post-capture filter in one line

import * as ImageManipulator from 'expo-image-manipulator';

const { uri: invertedUri } = await ImageManipulator.manipulateAsync(
  rawUri,
  [{ invert: true }],
  { format: ImageManipulator.SaveFormat.PNG }
);

Swap [{ invert:true }] for [{ grayscale:true }] etc.

⸻

Decision matrix

Need	Pick
Live AR-style preview	gl-react-expo option
Ship tonight, preview later	expo-image-manipulator option

Copy whichever block fits your project into Cursor Agent or directly into a new file, and Expo Go will run without native crashes.