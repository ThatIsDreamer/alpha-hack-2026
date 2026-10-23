# Mascot

Reusable controlled component using the supplied `Star 1.svg` (gray) and
`Star 2.svg` (red), copied unchanged into `src/assets/mascot/`.
The four geometric eye expressions reproduce the supplied reference. The blue
selection/path overlay on the first reference face is not part of the mascot.

```tsx
import { Mascot, type MascotExpression } from './components/Mascot'

<Mascot expression="happy" size={202} />
<Mascot expression="curious-left" size="4rem" animated={false} label="Размышляет" />
```

- `expression`: `happy`, `attentive`, `curious-left`, `curious-right` (default).
- `size`: CSS width string or pixels as a number. Aspect ratio stays 202:200.
- `animated`: defaults true. Gray rotates clockwise in 34s, red counterclockwise
  in 35s. Face remains upright. Pause preserves the current rotation.
- `label`: optional accessible description. Omit for decorative usage.
- `className`: optional integration styling.
- Reduced motion disables rotation automatically. No timers or React frame updates.

Standalone playground: `/demo/mascot`. It bypasses the banking shell and
company onboarding, and is not linked in the production sidebar. The mascot is also used in company onboarding and recommendation messages.

## Tuning and JSON presets

The playground now exposes 24 numeric sliders and independent star/gaze toggles.
`Скопировать JSON` exports `{ expression, config }`. All configuration values are
used directly by the component; there are no demo-only animation parameters.

```tsx
import { Mascot, DEFAULT_MASCOT_CONFIG } from './components/Mascot'

<Mascot expression="curious-left" config={{ ...DEFAULT_MASCOT_CONFIG,
  gazeDistance: 12, gazeDuration: 0.32, gazeHold: 0.18,
  gazeCenterHold: 1.2, gazeBounce: 0.22, eyeWidth: 26,
}} />
```

Paste the exported `config` into `mascot-config.ts` to change the baked-in defaults,
or pass it as a prop. Distances use the 202×200 SVG coordinate system; durations
are seconds. `gazeDuration` is one movement’s duration; `gazeHold` is the pause at each side.
`gazeCenterHold` is the center pause; `gazeBounce` controls the overshoot fraction.
The loop is center → first side → opposite side → center → pause, with mirrored
starting directions. Center eyes have matching configurable width and height.
Interest expressions run the same mirrored loop, starting in opposite directions.
The short and tall eyes exchange heights with each glance. `animated={false}`
shows the centered static expression. Reduced motion disables both gaze and spin.
Attention and interest share `eyeWidth`. Happiness uses its own `happyEyeWidth`
(default 35); curve and stroke tune its shape separately. The happy width slider
is included in exported JSON.

Eye outlines morph between expressions over `expressionBlend` seconds (default 0.45).
Set it to 0 for instant changes. The slider is included in exported JSON.
Star rotation continues uninterrupted; reduced motion disables shape morphing. Static instances with `animated={false}` switch immediately.

Expression morphing and attention tilt use a duration-based spring.
`expressionBounce` (default 0.3, range 0–0.6) controls overshoot independently
of gaze bounce; both settings are exported in JSON.

The approved character preset is baked into `DEFAULT_MASCOT_CONFIG` and
`DEFAULT_MASCOT_EXPRESSION`. Plain `<Mascot />`, the playground’s initial state,
and Reset use that same preset; props still allow overrides.
