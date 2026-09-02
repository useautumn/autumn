import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";

const MONOREPO_MARKERS = [
	"turbo.json",
	"pnpm-workspace.yaml",
	"pnpm-workspace.yml",
	"lerna.json",
	"nx.json",
	"rush.json",
] as const;

export type RepoLayout = {
	/** Git toplevel, else the outermost directory holding a package.json. */
	repoRoot: string;
	/** Nearest ancestor with a package.json — where generated files belong. */
	packageRoot: string;
	/** True when repoRoot shows a workspace marker and differs from packageRoot. */
	isMonorepo: boolean;
};

const gitToplevel = ({ cwd }: { cwd: string }): string | null => {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
};

const nearestPackageDir = ({ from }: { from: string }): string | null => {
	let current = from;
	const { root } = parse(current);
	while (true) {
		if (existsSync(join(current, "package.json"))) return current;
		if (current === root) return null;
		current = dirname(current);
	}
};

const declaresWorkspaces = ({ dir }: { dir: string }): boolean => {
	const manifest = join(dir, "package.json");
	if (!existsSync(manifest)) return false;
	try {
		return JSON.parse(readFileSync(manifest, "utf8")).workspaces !== undefined;
	} catch {
		return false;
	}
};

/**
 * Cheap probes, not a package-graph resolver — enough to place generated files
 * sensibly and to tell the user which package they are pointed at.
 */
export const findRepoLayout = ({
	cwd = process.cwd(),
}: {
	cwd?: string;
} = {}): RepoLayout => {
	const packageRoot = nearestPackageDir({ from: cwd }) ?? cwd;
	const repoRoot = gitToplevel({ cwd }) ?? packageRoot;

	const hasMarker =
		MONOREPO_MARKERS.some((marker) => existsSync(join(repoRoot, marker))) ||
		declaresWorkspaces({ dir: repoRoot });

	return {
		repoRoot,
		packageRoot,
		isMonorepo: hasMarker && repoRoot !== packageRoot,
	};
};
