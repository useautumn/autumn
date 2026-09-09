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
/** Bun runs TypeScript natively; the published node binary needs jiti for it. */
const importConfigModule = async ({
	path,
}: {
	path: string;
}): Promise<Record<string, unknown> & { default?: WireDocument }> => {
	if (typeof Bun !== "undefined") {
		return import(`${path}?v=${Date.now()}`);
	}
	const { createJiti } = await import("jiti");
	return createJiti(import.meta.url, { moduleCache: false }).import(
		path,
	) as Promise<Record<string, unknown> & { default?: WireDocument }>;
};

export const loadConfig = async ({
	dirs,
	configPath,
}: {
	dirs: string[];
	/** `-c`: an exact file, which may be named anything. */
	configPath?: string;
}): Promise<{ path: string; wire: WireDocument }> => {
	// An explicit path is the whole answer: a typo must not quietly load
	// whichever config the search would have found instead.
	const path =
		configPath !== undefined
			? existsSync(configPath)
				? configPath
				: null
			: findConfigPath({ dirs });
	if (!path) throw new ConfigNotFoundError(configPath ? [configPath] : dirs);

	// Cache-busted because the module cache would otherwise pin the first read
	// for the life of the process — irrelevant for a single `atmn push`, wrong
	// for anything that pushes twice (tests today, a watch mode later).
	// The query goes on the plain path: appended to a file:// href Bun
	// normalises it away and serves the cached module.
	let module: Record<string, unknown> & { default?: WireDocument };
	try {
		module = await importConfigModule({ path });
	} catch (error) {
		if (error instanceof ConfigError) {
			throw withFixtureLocations({ error, configPath: path });
		}
		throw error;
	}
	const wire = module.default;

	if (looksLikeV2Config({ module })) {
		throw new Error(
			`${path} is an atmn v2 config. v3 writes its own from your catalog: move this file aside, then run \`atmn pull\` to generate the v3 autumn.config.ts.`,
		);
	}
	if (wire === undefined) {
		throw new Error(
			`${path} has no default export. It should end with \`export default atmn({ ... })\`.`,
		);
	}

	return { path, wire };
};

/**
 * v2 exported plain fixtures — a default object with `products`/`features`
 * arrays, or named `feature()`/`product()` results — never a wire document,
 * which always carries `skip_deletions`.
 */
/** Fields only a v2 product carries. `items` is optional — an empty plan
 * states none — so the settings have to name the row on their own. */
const V2_PRODUCT_FIELDS = [
	"items",
	"is_add_on",
	"is_default",
	"free_trial",
	"group",
] as const;

/** A v2 fixture: a public `id` beside a feature's `type` or a product's own settings. */
const isV2Row = (value: unknown): boolean => {
	if (typeof value !== "object" || value === null) return false;
	const row = value as Record<string, unknown>;
	if (!("id" in row)) return false;
	return "type" in row || V2_PRODUCT_FIELDS.some((field) => field in row);
};

export const looksLikeV2Config = ({
	module,
}: {
	module: Record<string, unknown>;
}): boolean => {
	const defaults = module.default;
	if (typeof defaults === "object" && defaults !== null) {
		const bag = defaults as Record<string, unknown>;
		if ("skip_deletions" in bag) return false;
		if (
			["products", "features", "plans", "rewards"].some((key) =>
				Array.isArray(bag[key]),
			)
		)
			return true;
	}
	// A v2 default object proves nothing on its own: the named fixtures beside
	// it still do, so the check runs whatever the default export holds.
	return Object.entries(module).some(
		([name, value]) => name !== "default" && isV2Row(value),
	);
};
