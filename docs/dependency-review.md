# Dependency review

Reviewed November 3, 2026 for first publication. Registry audit results are installation-tree findings, not a statement that the browser runs every installed package. No forced upgrade, unsupported override or remote action was performed.

## Current finding

Both `npm audit` and `npm audit --omit=dev` completed. They report **9 moderate** and **4 moderate** affected packages respectively, with zero high/critical findings. The reports propagate one underlying advisory through dependent packages, rather than describing nine independent vulnerabilities. Audit exits nonzero while the finding remains.

The official [maintainer advisory GHSA-g3hv-75wg-m249](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249) describes CPU/memory amplification from attacker-controlled glob patterns when `optimizationLevel >= 2`. The [GitHub-reviewed advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) marks versions below 11.0.1 affected. Installed minimatch is 10.2.6. The first patched release is 11.0.1 and the current registry latest is 11.0.4; the latest 10.x remains 10.2.6.

## Paths and applicability

| Installed dependency path | Role in Qoima | Applicability |
| --- | --- | --- |
| `eslint -> minimatch` | Development lint tool | Handles local project file patterns; absent from browser chunks. |
| `eslint -> @eslint/config-array -> minimatch` | Development lint configuration | Trusted project globs, not inventory search input; absent from browser chunks. |
| `devextreme-exceljs-fork -> archiver -> readdir-glob -> minimatch` | Production installation tree, Node streaming writer | Not the browser document-workbook export path. |

ESLint-related effects also mark `@eslint-community/eslint-utils`, `@eslint/js` and `eslint-plugin-react-refresh` in the full audit. Node archive traversal propagates to `readdir-glob`, `archiver` and the ExcelJS fork in production-only audit.

Installed ESLint/config-array/readdir-glob call sites do not request optimization level 2; minimatch defaults to 1. Lint operates on trusted repository globs. This reduces current applicability, but would need review if untrusted configurations/globs were processed by a future service. Running an untrusted repository's tools is outside this conclusion.

The vendor's [browser documentation](https://raw.githubusercontent.com/DevExpress/devextreme-exceljs-fork/master/README.md) excludes streaming workbook readers/writers. Local source places archiver in `lib/stream/xlsx/workbook-writer.js`; Qoima imports the prebuilt `dist/dx-exceljs-fork.bare.min.js` document API and calls `Workbook.xlsx.writeBuffer()`. The shipped browser source map contains zero archiver/readdir-glob/minimatch sources. The actual production chunk metadata contains the browser bundle, not those Node packages. Vite builds this prebuilt input; it does not run Node archive glob traversal to generate user workbooks. Node tests import the package reader for workbook read-back, without using streaming/file-glob APIs.

This source/build inspection supports the conclusion that the affected Node path is not executed by current browser exports. It does not prove the entire application or prebundled vendor code is vulnerability-free. Reassess before introducing Node streaming, filesystem archive traversal, workbook imports or untrusted glob input.

## Fix decision

Current official npm metadata was checked:

- ESLint 10.14.0 requires minimatch `^10.2.6`.
- `@eslint/config-array` 0.23.5 requires `^10.2.4`.
- `readdir-glob` 3.0.0 requires `^10.2.2`.
- `devextreme-exceljs-fork` 4.5.0 requires archiver `^8.0.0`; installed archiver is 8.0.0.

No patched 10.x or compatible patched parent release is available at review time. Therefore this publication stage makes no dependency change. Installing minimatch 11 by override would cross all three parents' declared major ranges without upstream compatibility confirmation. An audit-suggested ESLint downgrade is not accepted as a verified fix. No `npm audit fix --force` was run.

Track upstream parent/backport releases and re-run both audits before publication/deployment. When a compatible fix exists, update the lockfile, run lint/build and the complete tests, and verify browser workbook generation/download. If release policy requires zero moderate findings, this remains a release gate requiring a supported fix or an explicit acceptance decision; it must not be hidden by a clean-build claim.

## Bundle status

The previous optimization reduced boot JavaScript from 579.39 to 496.99 kB (Node gzip 166.03 to 145.47 kB). Cold sign-in including its page is 503.83 / 147.95 kB. The optional writer decreased from 1303.24 / 284.20 to 1218.86 / 263.81 kB. These are consistent decimal-kB measurements from emitted files; Vite's native gzip estimate differs slightly.

Sanitized `artifacts/production-optimization/before.json` and `after.json` contain relative module paths, chunk graph and byte counts, with no source or environment values. The graph test checks static cycles, auth boot exclusions and writer independence from application pages. Rebuild and run `node scripts/report-build.mjs after` before using the report after source changes. The optional XLSX size warning remains visible; thresholds are unchanged. Additional bundle/library work is separate from resolving this advisory.
