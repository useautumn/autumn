// Builds the bundle image's /app tree: per-service bundles, the external packages they import,
// and a server/package.json whose scripts keep Flightcontrol's `bun <script>` commands working.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assertExternalsResolve } from "./assertExternalsResolve.ts";
import { assertNoBuildPathLeaks } from "./assertNoBuildPathLeaks.ts";
import { bundleEntry } from "./bundleEntry.ts";
import {
	copyExternalPackages,
	resolveExternalEntries,
} from "./copyExternalPackages.ts";
import { RUNTIME_RESOLVED_PACKAGES } from "./externals.ts";
import {
	BUNDLE_ENTRIES,
	RUNTIME_BUNFIGS,
	SERVICE_SCRIPTS,
} from "./services.ts";

// At build time Bun picks packages' "development" exports and the dev JSX runtime unless NODE_ENV is production.
if (process.env.NODE_ENV !== "production") {
	throw new Error(
		"Run with NODE_ENV=production so bundles resolve the modules production loads",
	);
}

const repoRoot = resolve(import.meta.dir, "../..");
const outDir = resolve(process.argv[2] ?? join(repoRoot, ".bundle-out"));

// pino.transport() resolves its target by name from the logger's own file.
const LOGGER_FILES = [
	"server/src/utils/logging/initLogger.ts",
	"packages/logging/src/logger/createLogger.ts",
];

rmSync(outDir, { recursive: true, force: true });

const externalImports = [];
for (const entry of BUNDLE_ENTRIES) {
	externalImports.push(...(await bundleEntry({ repoRoot, outDir, entry })));
	console.log(`bundled ${entry.name}`);
}
const runtimeImports = RUNTIME_RESOLVED_PACKAGES.flatMap((specifier) =>
	LOGGER_FILES.map((file) => ({ specifier, importer: join(repoRoot, file) })),
);

assertNoBuildPathLeaks({ repoRoot, distDir: join(outDir, "dist") });

const entryByName = resolveExternalEntries({
	imports: [...externalImports, ...runtimeImports],
});
const { copiedEntries } = copyExternalPackages({
	repoRoot,
	outDir,
	entryByName,
});
console.log(`external packages: ${[...entryByName.keys()].sort().join(", ")}`);
console.log(`copied ${copiedEntries} store entries`);
assertExternalsResolve({ outDir });

for (const bunfig of RUNTIME_BUNFIGS) {
	mkdirSync(dirname(join(outDir, bunfig)), { recursive: true });
	cpSync(join(repoRoot, bunfig), join(outDir, bunfig));
}
mkdirSync(join(outDir, "server"), { recursive: true });
writeFileSync(
	join(outDir, "server/package.json"),
	`${JSON.stringify({ name: "@autumn/server-bundle", private: true, scripts: SERVICE_SCRIPTS }, null, "\t")}\n`,
);
