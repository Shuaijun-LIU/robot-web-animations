# Robot Web Animations Planning

## Goal

Recreate the useful parts of the Spline robot interaction as a standalone Three.js project that can be deployed to GitHub without Spline runtime dependencies.

## Planned Interaction Scope

- [x] Load the local `robot.glb` model.
- [x] Normalize and frame the model for responsive display.
- [x] Add idle floating and subtle body motion.
- [x] Add pointer-follow head and eye motion.
- [x] Add hover visual emphasis.
- [x] Add click-triggered active state.
- [x] Build as a static Vite site.
- [ ] Push to GitHub.

## Notes

The original Spline scene contains runtime state/event strings such as `MouseHover`, `LookAt`, `Transition`, and `timelineAnimations`. These are not preserved as standard glTF animations in `robot.glb`, so the interactive behavior is reimplemented directly in Three.js.
