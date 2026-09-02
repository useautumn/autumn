import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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

	const module = await import(pathToFileURL(path).href);
	const wire = module.default;

	if (wire === undefined) {
		throw new Error(
			`${path} has no default export. It should end with \`export default atmn({ ... })\`.`,
		);
	}

	return { path, wire };
};
