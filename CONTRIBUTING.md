# Contributing

Issues and pull requests are welcome. Use a small synthetic example that explains the expected and observed result. Do not include member records, credentials, private carrier documents, or production logs.

Run the examples and tests with Node.js 22.18 or newer:

```sh
npm run demo:planmatch
npm run demo:pipeline
npm run demo:calculator
npm test
```

For a change to an extracted function, identify the affected calculation, add a meaningful boundary case, and explain whether it matches an application change or proposes a change. Maintainers should reconcile the source snapshot, declaration list, and hashes in `source-manifest.json` before release. Standalone adapters are identified separately so readers can tell them apart from retained application logic.

Keep source and documentation changes together. Record meaningful behavior changes in release notes, including changes to defaults, annual constants, input handling, and scoring modes. Preserve the public history after the initial clean release.

Contributions are provided under this repository's MIT license.
