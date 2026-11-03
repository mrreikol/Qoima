# Self-hosted typography

The application uses one upright Inter Variable WOFF2 from the official [Inter repository](https://github.com/rsms/inter): `https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/InterVariable.woff2`, downloaded unmodified on 2026-11-03. `Inter-OFL.txt` contains the official SIL Open Font License 1.1 from `LICENSE.txt` in the same repository.

`src/fonts.css` exposes the required 400–590 weight range with `font-display: swap`, system fallback and same-origin loading. Body text, navigation, headings, forms, data and the wordmark use this family. Quantities/prices use tabular numerals. No proprietary face or extra monospace asset is required. The application and isolated UI fixture import the same font stylesheet.

Earlier Geist/Manrope assets have been removed from the current implementation; earlier captures remain historical records. No font is requested from an external server at runtime.
