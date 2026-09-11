import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { findRepoLayout } from "../repo/findRepoRoot";

const CONFIG_FILENAMES = ["autumn.config.ts", "autumn.config.js"] as const;

/** The root package.json field `atmn init` writes so later commands find the config from anywhere in the repo. */
export const MARKER_FIELD = "atmn";

export type ProjectMarker = { config: string };

export type Project = {
	repoRoot: string;
	/** The config file, when one could be found. */
	configPath: string | null;
	/** Where fixtures, planVersions/ and skills/ live: the config's folder, else cwd. */
	configDir: string;
	/** Where `.env` is looked for, root first: an existing file anywhere here is
	 * reused, and a new one is created at the root so one file serves every package. */
	envDirs: string[];
	/** How the config was found; `hint` is printed when a command needs one and there is none. */
	source: "flag" | "cwd" | "marker" | "none";
};

const configIn = ({ dir }: { dir: string }): string | null => {
	for (const filename of CONFIG_FILENAMES) {
		const path = join(dir, filename);
		if (existsSync(path)) return path;
	}
	return null;
};

/** `-c` takes a file or a directory; a directory means the config it holds, or a new autumn.config.ts. */
export const configPathFromFlag = ({
	cwd,
	flag,
}: {
	cwd: string;
	flag: string;
}): string => {
	const resolved = isAbsolute(flag) ? flag : resolve(cwd, flag);
	const isFile = /\.(ts|js)$/.test(resolved);
	if (isFile) return resolved;
	if (existsSync(resolved) && !statSync(resolved).isDirectory())
		return resolved;
	// A folder means whichever config it holds; a new folder gets the .ts one.
	return configIn({ dir: resolved }) ?? join(resolved, "autumn.config.ts");
};

export const readMarker = ({
	repoRoot,
}: {
	repoRoot: string;
}): ProjectMarker | null => {
	const manifest = join(repoRoot, "package.json");
	if (!existsSync(manifest)) return null;
	try {
		const parsed = JSON.parse(readFileSync(manifest, "utf8")) as Record<
			string,
			unknown
		>;
		const marker = parsed[MARKER_FIELD];
		if (
			typeof marker === "object" &&
			marker !== null &&
			typeof (marker as ProjectMarker).config === "string"
		)
			return { config: (marker as ProjectMarker).config };
		return null;
	} catch {
		return null;
	}
};

/**
 * Where this run's config and `.env` are. The flag wins, then a config beside
 * cwd, then the root marker `atmn init` wrote: the common case of running
 * `atmn push` from the repo root of a monorepo lands on the marker.
 */
export const resolveProject = ({
	cwd,
	configFlag,
}: {
	cwd: string;
	configFlag?: string;
}): Project => {
	const { repoRoot, packageRoot } = findRepoLayout({ cwd });

	let configPath: string | null = null;
	let source: Project["source"] = "none";
	if (configFlag !== undefined) {
		configPath = configPathFromFlag({ cwd, flag: configFlag });
		source = "flag";
	} else if (configIn({ dir: cwd }) !== null) {
		configPath = configIn({ dir: cwd });
		source = "cwd";
	} else {
		const marker = readMarker({ repoRoot });
		if (marker !== null) {
			configPath = resolve(repoRoot, marker.config);
			source = "marker";
		}
	}

	const configDir = configPath === null ? cwd : dirname(configPath);
	return {
		repoRoot,
		configPath,
		configDir,
		envDirs: [
			...new Set([repoRoot, configDir, cwd, join(cwd, "atmn"), packageRoot]),
		],
		source,
	};
};
