import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { configPackageName } from "../../config/configPackageName";
import { COLLECTIONS } from "../../generated/emit";

/** Where a config imports from: the published package, or generated files in-repo. */
export type ConfigImports = { atmn: string; builders: string };

export const packageImports = (): ConfigImports => {
	const name = configPackageName();
	return { atmn: name, builders: name };
};

/**
 * One file per catalog surface. `rewards.ts` holds both reward collections:
 * a referral program names a reward, so they read as one thing.
 */
export const COLLECTION_FILES: Readonly<Record<string, readonly string[]>> = {
	"features.ts": ["features"],
	"plans.ts": ["plans"],
	"rewards.ts": ["rewards", "referralPrograms"],
};

const builderImportsFor = ({
	collections,
	specifier,
}: {
	collections: readonly string[];
	specifier: string;
}): string => {
	const builders = collections
		.flatMap((name) => {
			const spec = COLLECTIONS[name];
			if (spec === undefined) return [];
			return spec.branches
				? spec.branches.map((branch) => branch.builder)
				: [spec.builder];
		})
		.sort();
	return `import { ${builders.join(", ")} } from "${specifier}";`;
};

const collectionFileSource = ({
	collections,
	imports,
}: {
	collections: readonly string[];
	imports: ConfigImports;
}): string =>
	[
		builderImportsFor({ collections, specifier: imports.builders }),
		"",
		...collections.map((name) => `export const ${name} = [];`),
		"",
	].join("\n");

const rootSource = ({ imports }: { imports: ConfigImports }): string => {
	const collectionImports = Object.entries(COLLECTION_FILES).map(
		([file, collections]) =>
			`import { ${collections.join(", ")} } from "./${file.replace(/\.ts$/, "")}";`,
	);
	const collectionKeys = Object.values(COLLECTION_FILES).flatMap(
		(collections) => collections.map((name) => `\t${name},`),
	);
	return [
		`import { atmn } from "${imports.atmn}";`,
		...collectionImports,
		"",
		"/**",
		" * Your catalog, as code. `atmn pull` fills the collection files from the",
		" * server; `atmn push` makes the server match them.",
		" */",
		"export default atmn({",
		...collectionKeys,
		"\tsettings: {},",
		"});",
		"",
	].join("\n");
};

/**
 * The first pull's starting point: a root config that imports one empty
 * array per collection from its own file, so the pull that follows appends
 * the whole catalog into them.
 */
export const scaffoldConfig = ({
	directory,
	configPath = join(directory, "autumn.config.ts"),
	imports = packageImports(),
}: {
	directory: string;
	/** `-c` may name the file; the folder is created when missing. */
	configPath?: string;
	imports?: ConfigImports;
}): string => {
	mkdirSync(directory, { recursive: true });
	writeFileSync(configPath, rootSource({ imports }), "utf8");
	// Collection files sit beside the config, wherever `-c` put it.
	const configDir = dirname(configPath);
	for (const [file, collections] of Object.entries(COLLECTION_FILES)) {
		const path = join(configDir, file);
		if (existsSync(path)) continue;
		writeFileSync(path, collectionFileSource({ collections, imports }), "utf8");
	}
	return configPath;
};
