import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COLLECTIONS } from "../../generated/emit";

/** Where a config imports from: the published package, or generated files in-repo. */
export type ConfigImports = { atmn: string; builders: string };

export const PACKAGE_IMPORTS: ConfigImports = {
	atmn: "atmn-nightly",
	builders: "atmn-nightly",
};

const importLines = ({ imports }: { imports: ConfigImports }): string[] => {
	const builders = Object.values(COLLECTIONS)
		.map((spec) => spec.builder)
		.sort();
	if (imports.atmn === imports.builders) {
		return [`import { atmn, ${builders.join(", ")} } from "${imports.atmn}";`];
	}
	return [
		`import { ${builders.join(", ")} } from "${imports.builders}";`,
		`import { atmn } from "${imports.atmn}";`,
	];
};

/**
 * The first pull's starting point: a root config with every collection present
 * and empty, so the pull that follows appends the whole catalog into it.
 */
export const scaffoldConfig = ({
	directory,
	imports = PACKAGE_IMPORTS,
}: {
	directory: string;
	imports?: ConfigImports;
}): string => {
	const configPath = join(directory, "autumn.config.ts");
	const collections = Object.keys(COLLECTIONS).map((name) => `\t${name}: [],`);
	writeFileSync(
		configPath,
		[
			...importLines({ imports }),
			"",
			"/**",
			" * Your catalog, as code. `atmn pull` fills these arrays from the server;",
			" * `atmn push` makes the server match them.",
			" */",
			"export default atmn({",
			...collections,
			"});",
			"",
		].join("\n"),
		"utf8",
	);

	const versionsDirectory = join(directory, "planVersions");
	mkdirSync(versionsDirectory, { recursive: true });
	const keep = join(versionsDirectory, ".gitkeep");
	if (!existsSync(keep)) writeFileSync(keep, "", "utf8");

	return configPath;
};
