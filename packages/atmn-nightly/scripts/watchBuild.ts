import { watch } from "node:fs";
import { join } from "node:path";

const PACKAGE_ROOT = join(import.meta.dir, "..");
const DEBOUNCE_MS = 150;

/** One build per burst of saves: an editor writes several files at once. */
let pending: ReturnType<typeof setTimeout> | undefined;

const build = (): void => {
	const result = Bun.spawnSync(["bun", "run", "bun.config.ts"], {
		cwd: PACKAGE_ROOT,
		stdout: "inherit",
		stderr: "inherit",
	});
	if (result.exitCode !== 0)
		console.error("build failed; watching for changes");
};

const scheduleBuild = (): void => {
	if (pending !== undefined) clearTimeout(pending);
	pending = setTimeout(build, DEBOUNCE_MS);
};

build();
for (const target of ["src", "package.json"]) {
	watch(join(PACKAGE_ROOT, target), { recursive: true }, scheduleBuild);
}
console.log("watching src/ and package.json — rebuilding dist on change");
