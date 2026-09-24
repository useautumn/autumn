import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	COLLECTION_FILES,
	type ConfigImports,
	collectionFileSource,
	rootSource,
} from "./scaffoldConfig";

const PACKAGE_NAMES = ["atmn", "atmn-nightly"];

/** A file is ours when it imports the config package; anything else is the user's. */
export const importsConfigPackage = ({
	text,
	imports,
}: {
	text: string;
	imports: ConfigImports;
}): boolean =>
	[imports.atmn, imports.builders, ...PACKAGE_NAMES].some(
		(specifier) =>
			text.includes(`from "${specifier}"`) ||
			text.includes(`from '${specifier}'`),
	);

/**
 * Overwrite without deleting: the config becomes a fresh shell, and each
 * collection file beside it is rewritten only when it is ours. A collection
 * whose file belongs to the user is kept inline in the config instead.
 */
export const rewriteConfig = ({
	configPath,
	imports,
}: {
	configPath: string;
	imports: ConfigImports;
}): { rewritten: string[]; kept: string[] } => {
	const configDir = dirname(configPath);
	const importedFiles = new Set<string>();
	const rewritten: string[] = [];
	const kept: string[] = [];
	for (const [file, collections] of Object.entries(COLLECTION_FILES)) {
		const path = join(configDir, file);
		const isUsers =
			existsSync(path) &&
			!importsConfigPackage({ text: readFileSync(path, "utf8"), imports });
		if (isUsers) {
			kept.push(path);
			continue;
		}
		writeFileSync(path, collectionFileSource({ collections, imports }), "utf8");
		importedFiles.add(file);
		rewritten.push(path);
	}
	writeFileSync(configPath, rootSource({ imports, importedFiles }), "utf8");
	return { rewritten: [configPath, ...rewritten], kept };
};
