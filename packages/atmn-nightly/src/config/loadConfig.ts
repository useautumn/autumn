import { existsSync } from "node:fs";
import { join } from "node:path";
import { COLLECTIONS } from "../generated/emit";
import { ConfigError, type LintIssue } from "../generated/lintRuntime";
import { fixtureLocation } from "../surgery/fixtureLocation";

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

/** A finding's breadcrumb starts with its top-level fixture, e.g. `feature "x"`. */
const TOP_LEVEL_FIXTURE = /^(\w+) "([^"]*)"/;

/** Where a finding's fixture lives, `undefined` when its breadcrumb names none
 * (a document-level error) or the fixture text can't be found. */
const locationOf = ({
	issue,
	configPath,
}: {
	issue: LintIssue;
	configPath: string;
}): string | undefined => {
	const match = TOP_LEVEL_FIXTURE.exec(issue.path.split(" › ")[0] ?? "");
	if (!match) return undefined;
	const [, builder, id] = match;
	const collection = Object.values(COLLECTIONS).find(
		(spec) => spec.builder === builder,
	);
	if (!collection || id === undefined) return undefined;

	const found = fixtureLocation({
		configPath,
		builder: collection.builder,
		idField: collection.idField,
		id,
	});
	return found ? `${found.file}:${found.line}` : undefined;
};

/** Every locatable finding gets its source appended, so a config error points
 * back at the file the user actually needs to open. */
const withFixtureLocations = ({
	error,
	configPath,
}: {
	error: ConfigError;
	configPath: string;
}): ConfigError =>
	new ConfigError(
		error.issues.map((issue) => {
			const location = locationOf({ issue, configPath });
			return location
				? { ...issue, message: `${issue.message} (${location})` }
				: issue;
		}),
	);

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
	let module: { default?: WireDocument };
	try {
		module = await import(`${path}?v=${Date.now()}`);
	} catch (error) {
		if (error instanceof ConfigError) {
			throw withFixtureLocations({ error, configPath: path });
		}
		throw error;
	}
	const wire = module.default;

	if (wire === undefined) {
		throw new Error(
			`${path} has no default export. It should end with \`export default atmn({ ... })\`.`,
		);
	}

	return { path, wire };
};
