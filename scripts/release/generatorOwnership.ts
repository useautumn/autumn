import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SPEAKEASY_SDK_DIRS = ["packages/sdk", "others/python-sdk"];
const API_REFERENCE_DIR = "apps/docs/mintlify/api-reference/";

// Mirrors pruneApiReferencePages in packages/openapi: how the docs generator recognises its own pages.
const GENERATED_PAGE_MARKER =
	/import \{ DynamicParamField \} from "\/snippets\/dynamic-param-field\.jsx";|^openapi: ["']?api\/openapi\.yml webhook |<Note>Schema documentation for this event type is coming soon\.<\/Note>/m;

const readCommitted = ({ root, path }: { root: string; path: string }) => {
	const result = Bun.spawnSync(["git", "show", `HEAD:${path}`], { cwd: root });
	return result.exitCode === 0 ? result.stdout.toString() : undefined;
};

// Working tree first, then HEAD, so deleted files keep their last known content.
const readEither = ({ root, path }: { root: string; path: string }) => {
	const fullPath = join(root, path);
	if (existsSync(fullPath)) return readFileSync(fullPath, "utf8");
	return readCommitted({ root, path });
};

const speakeasyTrackedFiles = ({
	root,
	sdkDir,
}: {
	root: string;
	sdkDir: string;
}) => {
	const lockPath = `${sdkDir}/.speakeasy/gen.lock`;
	const files = new Set<string>();
	const fullPath = join(root, lockPath);
	const versions = [
		existsSync(fullPath) ? readFileSync(fullPath, "utf8") : undefined,
		readCommitted({ root, path: lockPath }),
	];
	for (const text of versions) {
		if (!text) continue;
		const lock = Bun.YAML.parse(text) as {
			trackedFiles?: Record<string, unknown>;
		};
		for (const file of Object.keys(lock.trackedFiles ?? {})) {
			files.add(`${sdkDir}/${file}`);
		}
	}
	return files;
};

export const loadGeneratorOwnership = ({ root }: { root: string }) => {
	const speakeasyOwned = new Set(
		SPEAKEASY_SDK_DIRS.flatMap((sdkDir) => [
			...speakeasyTrackedFiles({ root, sdkDir }),
		]),
	);
	return (path: string) => {
		if (path.split("/").slice(0, -1).includes("generated")) return true;
		if (speakeasyOwned.has(path)) return true;
		if (path.startsWith(API_REFERENCE_DIR) && path.endsWith(".mdx")) {
			return GENERATED_PAGE_MARKER.test(readEither({ root, path }) ?? "");
		}
		return false;
	};
};
