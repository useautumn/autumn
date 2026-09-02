import { existsSync } from "node:fs";
import { join } from "node:path";

const CONFIG_FILENAMES = ["autumn.config.ts", "autumn.config.js"] as const;

/** Opaque until the generator emits the real type — the wire document. */
export type WireDocument = Record<string, unknown>;

export class ConfigNotFoundError extends Error {
	constructor(searched: string[]) {
		super(
			`No autumn.config.ts found. Looked in:\n${searched
				.map((path) => `  ${path}`)
				.join("\n")}\n\nRun \`atmn-nightly pull\` to scaffold one.`,
		);
		this.name = "ConfigNotFoundError";
	}
}

export const findConfigPath = ({ dirs }: { dirs: string[] }): string | null => {
	for (const dir of dirs) {
		for (const filename of CONFIG_FILENAMES) {
			const path = join(dir, filename);
			if (existsSync(path)) return path;
		}
	}
	return null;
};

/**
 * Imports the config in-process — it is the user's own code on their own
 * machine, npm-script trust level. The subprocess + stdout contract that
 * existed for non-TS producers is gone; this function is the seam a future
 * `--config-json` would slot into.
 */
export const loadConfig = async ({
	dirs,
}: {
	dirs: string[];
}): Promise<{ path: string; wire: WireDocument }> => {
	const path = findConfigPath({ dirs });
	if (!path) throw new ConfigNotFoundError(dirs);

	// Cache-busted because the module cache would otherwise pin the first read
	// for the life of the process — irrelevant for a single `atmn push`, wrong
	// for anything that pushes twice (tests today, a watch mode later).
	// The query goes on the plain path: appended to a file:// href Bun
	// normalises it away and serves the cached module.
	const module = await import(`${path}?v=${Date.now()}`);
	const wire = module.default;

	if (wire === undefined) {
		throw new Error(
			`${path} has no default export. It should end with \`export default atmn({ ... })\`.`,
		);
	}

	return { path, wire };
};
