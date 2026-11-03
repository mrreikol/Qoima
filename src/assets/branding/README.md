# Qoima brand assets

`qoima-symbol.svg` is a clean local recreation of the user-supplied Qoima reference: the open geometric Q contains three storage-cell faces and the lower-right Q tail. It has no background, raster texture, presentation margins or duplicate mark. The application references the SVG's reusable `qoima-symbol` fragment and controls its color through `--brand-symbol`.

`src/components/Brand.jsx` exports a full live-text lockup and a symbol-only variant. The optional Digital Warehouse tagline is live text; it is used in authentication headers, while navigation uses the compact symbol and Qoima wordmark. Decorative symbols are hidden from assistive technology; standalone symbol variants have an accessible Qoima name.

`public/favicon.svg` places the same Q form on a compact near-black tile with a lime mark and slightly thicker internal separators for small sizes. It stays readable in both light and dark browser chrome. The in-app symbol instead follows the selected application theme. Inter Variable is the existing licensed wordmark typeface.

Inventory download names use `qoima-products-YYYY-MM-DD.csv` or `.xlsx`; the date is the browser's local calendar date. Only the filename changes: export scope, types, CSV escaping and formula protection are unchanged. Existing storage/recovery keys and database identifiers retain their historical technical names.
