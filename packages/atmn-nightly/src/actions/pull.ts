import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ConfigNotFoundError, loadConfig } from "../config/loadConfig";
import { loadEnvFiles } from "../env/loadEnv";
import type { AutumnClient } from "../generated/client";
import { COLLECTIONS } from "../generated/emit";
import { applyPreview, type PreviewEntry } from "./pull/applyPreview";
import { listSourceFiles } from "./pull/listSourceFiles";
import { type ConfigImports, scaffoldConfig } from "./pull/scaffoldConfig";
import { configSearchDirs } from "./push";

export type PullResult = {
	configPath: string;
	appended: string[];
	replaced: string[];
	deleted: string[];
};

export type PullOptions = {
	client: AutumnClient;
	cwd?: string;
	/** Keep processor mappings (Stripe product/meter ids) in pulled fixtures. */
	includeMappings?: boolean;
	/** Where to write progress. Injected so tests can capture it. */
	write?: (text: string) => void;
	/** Module specifiers a scaffolded config imports from; the package by default. */
	imports?: ConfigImports;
};

/** No config means a first pull: scaffold one at `cwd`, then pull into it. */
const loadOrScaffold = async ({
	dirs,
	cwd,
	imports,
	write,
}: {
	dirs: string[];
	cwd: string;
	imports: ConfigImports | undefined;
	write: (text: string) => void;
}) => {
	try {
		return await loadConfig({ dirs });
	} catch (error) {
		if (!(error instanceof ConfigNotFoundError)) throw error;
		const configPath = scaffoldConfig({ directory: cwd, imports });
		write(`Scaffolded ${configPath}\n`);
		return loadConfig({ dirs: [cwd] });
	}
};

const entriesOf = (value: unknown): PreviewEntry[] =>
	Array.isArray(value) ? (value as PreviewEntry[]) : [];

const rowsOf = (value: unknown): Record<string, unknown>[] =>
	Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

/**
 * Pull rides preview: the server's diff drives every edit, and the CLI never
 * diffs anything itself. Config sources are held in memory and only files
 * whose text changed go back to disk.
 */
export const runPull = async ({
	client,
	cwd = process.cwd(),
	includeMappings = false,
	write = (text) => process.stdout.write(text),
	imports,
}: PullOptions): Promise<PullResult> => {
	const dirs = configSearchDirs({ cwd });
	loadEnvFiles({ dirs });

	const { path: configPath, wire } = await loadOrScaffold({
		dirs,
		cwd,
		imports,
		write,
	});

	const [preview, catalog] = await Promise.all([
		client.previewUpdate(wire),
		client.get({}),
	]);

	const files = new Map<string, string>();
	files.set(configPath, readFileSync(configPath, "utf8"));
	for (const file of listSourceFiles({ directory: dirname(configPath) })) {
		// The config is already in the map and is always tried first.
		if (file === configPath || files.has(file)) continue;
		files.set(file, readFileSync(file, "utf8"));
	}
	const originals = new Map(files);

	const appended: string[] = [];
	const replaced: string[] = [];
	const deleted: string[] = [];
	const lines: string[] = [];
	const unlocated: { collection: string; id: string; action: string }[] = [];
	const previewRows = preview as unknown as Record<string, unknown>;
	const catalogRows = catalog as unknown as Record<string, unknown>;

	for (const [collection, spec] of Object.entries(COLLECTIONS)) {
		const applied = applyPreview({
			collection,
			spec,
			entries: entriesOf(previewRows[collection]),
			catalogRows: rowsOf(catalogRows[collection]),
			configPath,
			files,
			includeMappings,
		});
		appended.push(...applied.appended);
		replaced.push(...applied.replaced);
		deleted.push(...applied.deleted);
		lines.push(...applied.lines);
		unlocated.push(
			...applied.unlocated.map((entry) => ({ collection, ...entry })),
		);
	}

	// A fixture that is not a plain literal cannot be edited in place; saying
	// so before writing anything beats a half-applied pull.
	if (unlocated.length > 0) throw new UnlocatableFixturesError({ unlocated });

	for (const [file, source] of files) {
		if (source === originals.get(file)) continue;
		writeFileSync(file, source, "utf8");
	}

	write(
		lines.length === 0
			? "Nothing to pull.\n"
			: `${lines.join("\n")}\nPulled.\n`,
	);

	return { configPath, appended, replaced, deleted };
};

export class UnlocatableFixturesError extends Error {
	constructor({
		unlocated,
	}: {
		unlocated: { collection: string; id: string; action: string }[];
	}) {
		super(
			[
				`atmn pull cannot edit ${unlocated.length} fixture${unlocated.length === 1 ? "" : "s"} — each must be a plain literal (no spreads, helpers or .map()):`,
				...unlocated.map(
					({ collection, id, action }) =>
						`  ${collection} ${JSON.stringify(id)}: ${action}`,
				),
			].join("\n"),
		);
		this.name = "UnlocatableFixturesError";
	}
}
