import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "../constants.ts";

const LOCKFILE_PLAYWRIGHT_CORE_REGEX =
	/^\s*"playwright-core": \["playwright-core@([\d.]+)"/m;

/**
 * The playwright-core version `server/` resolves to, read from the lockfile the
 * µVM installs. Probing for it INSIDE the image/VM at the REPO ROOT is wrong:
 * with the isolated linker only `server/node_modules` has playwright-core, so a
 * root probe silently falls back to a stale pin and bakes a browser revision
 * `chromium.executablePath()` will never find at test time.
 */
export const resolveBakedPlaywrightVersion = (): string => {
	const lockPath = join(PROJECT_ROOT, "bun.lock");
	const version = LOCKFILE_PLAYWRIGHT_CORE_REGEX.exec(
		readFileSync(lockPath, "utf8"),
	)?.[1];
	if (version) return version;

	try {
		const installed = join(
			PROJECT_ROOT,
			"server/node_modules/playwright-core/package.json",
		);
		return JSON.parse(readFileSync(installed, "utf8")).version as string;
	} catch {
		throw new Error(
			`[tw] cannot resolve playwright-core version (no top-level entry in ${lockPath}, ` +
				"and server/node_modules/playwright-core is absent) — the chromium bake would " +
				"install a mismatched browser revision.",
		);
	}
};
