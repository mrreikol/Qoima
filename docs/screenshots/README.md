# Public interface screenshots

These are browser captures of the current Qoima React pages, not generated mockups. They use the isolated local visual fixture in `tests/fixtures/redesign`, with the same page components, styles, brand assets and font as the application. No application functionality was changed to take them.

The existing images were reviewed on November 4, 2026 and retained without recapture or editing. All four JPEG files have no EXIF metadata.

The illustrative data represents a small office-supplies inventory: six active products, two archives and 18 stock movements across seven local days. It includes in-stock, low-stock and out-of-stock examples. Movement results and final balances were checked for consistency. The visible address, `inventory@qoima.example`, is fictional; no personal email or live inventory appears. AUTHZ/STK verification fixtures, credentials, browser chrome and development banners are excluded.

| File | Captured image size | View |
| --- | --- | --- |
| `dashboard-desktop.jpg` | 1424 × 1304 | Dashboard, chart, attention list and recent movements |
| `products-desktop.jpg` | 1264 × 981 | Product workspace and distinct stock actions |
| `product-details-desktop.jpg` | 1264 × 856 | Product balance, actions and metadata |
| `products-mobile.jpg` | 375 × 811 | Products at a 390 × 844 browser viewport |

Desktop capture viewports were 1440 or 1280 px wide; images contain application content without browser chrome. Saved image dimensions can differ from the CSS viewport. Screenshots use the resolved Dark theme. They demonstrate UI presentation, not successful authentication, writes, exports or hosted verification.

## Reproduce locally

```powershell
node tests/fixtures/redesign/serve.mjs
```

Open these local routes, wait for fonts/data to finish loading and capture only the application:

- `http://localhost:5318/dashboard?screenshots`
- `http://localhost:5318/products?screenshots`
- `http://localhost:5318/products/10000000-0000-4000-8000-000000000001?screenshots`

Use Products at a 390 px viewport for the mobile capture. The explicit `screenshots` query flag hides only the fixture's review banner; it does not alter the page layout or production entry point. Environment loading is disabled, queries are local, and inventory writes are rejected. This fixture must not be deployed and is not a production demo fallback. Without the flag, the normal development review banner remains visible.
