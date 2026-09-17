import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { configPackageName } from "../config/configPackageName";
import { MARKER_FIELD, readMarker } from "./resolveProject";

const readJson = (path: string): Record<string, unknown> =>
	JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

const writeJson = (path: string, value: unknown): void => {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
};

/** The root's marker and script, added beside whatever is already there. */
export const writeRootMarker = ({
	repoRoot,
	configPath,
}: {
	repoRoot: string;
	configPath: string;
}): boolean => {
	const manifestPath = join(repoRoot, "package.json");
	const manifest = existsSync(manifestPath) ? readJson(manifestPath) : {};
	const config = relative(repoRoot, configPath);
	const scripts = (manifest.scripts ?? {}) as Record<string, string>;
	const next = {
		...manifest,
		scripts: {
			...scripts,
			atmn: `${configPackageName()} -c ${JSON.stringify(config)}`,
		},
		[MARKER_FIELD]: { config },
	};
	if (
		readMarker({ repoRoot })?.config === config &&
		scripts.atmn === next.scripts.atmn
	)
		return false;
	writeJson(manifestPath, next);
	return true;
};
