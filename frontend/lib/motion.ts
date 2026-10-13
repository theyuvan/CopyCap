// Named, reused easing curves — mirrors the --ease-out-expo/--ease-out-quart
// CSS custom properties in globals.css. Framer Motion needs JS arrays, not
// CSS var() strings, so these are the same curves duplicated for motion
// props. Using these everywhere instead of ad-hoc easeInOut/easeOut per
// component is what makes motion read as one deliberate system.
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;
