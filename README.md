# Robot Web Animations

A standalone Three.js robot animation demo using the local `robot.glb` asset exported from Spline.

## Features

- Local GLB loading from `public/models/robot.glb`.
- No Spline runtime package and no remote `.splinecode` dependency.
- Pointer-follow head and eye motion.
- Hover emphasis and click-triggered state changes.
- Static-host-friendly Vite build.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The production output is written to `dist/`.
