import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { COLLECTIONS } from "../generated/emit";
import { ConfigError, type LintIssue } from "../generated/lintRuntime";
import { fixtureLocation } from "../surgery/fixtureLocation";
import { configPackageName } from "./configPackageName";
import { isLegacyConfigText, LegacyConfigError } from "./legacyConfig";

const CONFIG_FILENAMES = ["autumn.config.ts", "autumn.config.js"] as const;

/** Opaque until the generator emits the real type — the wire document. */
export type WireDocument = Record<string, unknown>;

export class ConfigNotFoundError extends Error {
	constructor(searched: string[]) {
		super(
			`No autumn.config.ts found. Looked in:\n${searched
				.map((path) => `  ${path}`)
				.join(
					"\n",
				)}\n\nRun \`${configPackageName()} init\` to create one, or pass -c <dir>.`,
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
/**
 * A fresh process per load: the root imports its collection files, and no
 * in-process import — Bun's `?v=` bust, jiti's `moduleCache: false` — re-reads
 * a dependency after the first load. A single push never notices; pull edits
 * the collection files and then re-evaluates the config, so it must.
 */
/**
 * Bun imports a .ts config natively. Node goes through jiti's own import,
 * which transpiles and handles CJS/ESM interop itself; the package is resolved
 * from this CLI's install, never from the config's folder.
 */
export const importConfigArgs = ({
	path,
	onBun = typeof Bun !== "undefined",
}: {
	path: string;
	onBun?: boolean;
}): string[] => {
	const target = JSON.stringify(path);
	const load = onBun
		? `import(${target})`
		: `import(${JSON.stringify(import.meta.resolve("jiti"))}).then(({ createJiti }) => createJiti(${target}).import(${target}))`;
	const report = `(m) => process.stdout.write(JSON.stringify({ ok: true, module: { ...m, default: m.default } })), (e) => process.stdout.write(JSON.stringify({ ok: false, name: e?.name, message: e?.message, issues: e?.issues }))`;
	return ["-e", `${load}.then(${report})`];
};

const importConfigModule = async ({
	path,
}: {
	path: string;
}): Promise<Record<string, unknown> & { default?: WireDocument }> => {
	const result = spawnSync(process.execPath, importConfigArgs({ path }), {
		cwd: dirname(path),
		encoding: "utf8",
		// Bun hands a child its startup env, not process.env: without this, a
		// config reading a value atmn loaded from .env sees undefined.
		env: process.env,
	});
	if (result.status !== 0 || result.stdout.length === 0) {
		throw new Error(result.stderr.trim() || `Failed to load ${path}`);
	}
	const parsed = JSON.parse(result.stdout) as
		| { ok: true; module: Record<string, unknown> & { default?: WireDocument } }
		| { ok: false; name?: string; message?: string; issues?: LintIssue[] };
	if (parsed.ok) return parsed.module;
	if (parsed.name === "ConfigError" && parsed.issues)
		throw new ConfigError(parsed.issues);
	throw new Error(parsed.message ?? `Failed to load ${path}`);
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
	// A 1.x config would die inside the import with "item is not exported";
	// say what happened and how to move instead.
	if (isLegacyConfigText({ text: readFileSync(path, "utf8") })) {
		throw new LegacyConfigError({ path });
	}

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

	if (looksLikeV2Config({ module })) throw new LegacyConfigError({ path });
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
