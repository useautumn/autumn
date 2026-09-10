import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { configPackageName } from "../../config/configPackageName";
import {
	loadEnvFiles,
	removeEnvValues,
	writeEnvValues,
} from "../../env/loadEnv";
import { SANDBOX_PIN_NAME, sandboxKeyName } from "../../env/sandboxKeyName";
import { AutumnApiError } from "../../generated/client";
import { MARKER_FIELD, readMarker } from "../../project/resolveProject";
import {
	ask,
	confirm,
	done,
	hint,
	type Prompter,
	soft,
} from "../../prompt/prompt";
import { findRepoLayout } from "../../repo/findRepoRoot";
import { version } from "../../version";
import type { OrgInfo } from "../env/types/orgInfo";
import type { LoginResult } from "../login";
import { scaffoldConfig } from "../pull/scaffoldConfig";
import { installSkills, SKILLS_DIR_NAME } from "../skills/skills";

/** The network, behind functions so a test can hand over fakes. */
export type InitDeps = {
	fetchOrgInfo: ({ secretKey }: { secretKey: string }) => Promise<OrgInfo>;
	login: ({ envDirs }: { envDirs: string[] }) => Promise<LoginResult>;
	pull: ({
		configDir,
	}: {
		configDir: string;
	}) => Promise<{ appended: string[]; replaced: string[]; deleted: string[] }>;
	/** `<manager> install` at the root, so the new package's config can import the CLI before pull. */
	install: ({
		manager,
		repoRoot,
	}: {
		manager: string;
		repoRoot: string;
	}) => Promise<boolean>;
};

export type InitOptions = {
	cwd?: string;
	/** What the new package depends on for the builders; the published CLI by default. */
	dependencySpec?: string;
	/** Folder for the Autumn package, repo-root relative; asked for in a monorepo. */
	path?: string;
	/** The package's name; asked for in a monorepo. */
	name?: string;
	/** Log in when no usable main key is on disk; asked for otherwise. */
	login?: boolean;
	deps: InitDeps;
	prompter: Prompter;
};

export type InitResult = {
	repoRoot: string;
	configDir: string;
	configPath: string;
	org: OrgInfo;
};

const DEFAULT_PACKAGE_DIR = "packages/autumn";
const DEFAULT_PACKAGE_NAME = "autumn";
const PACKAGE_NAME = configPackageName();

type KeyCheck =
	| { kind: "main"; info: OrgInfo }
	| { kind: "sub"; info: OrgInfo; secretKey: string }
	| { kind: "missing" };

const checkMainKey = async ({
	deps,
}: {
	deps: InitDeps;
}): Promise<KeyCheck> => {
	const secretKey = process.env.AUTUMN_SECRET_KEY;
	if (!secretKey) return { kind: "missing" };
	try {
		const info = await deps.fetchOrgInfo({ secretKey });
		return info.is_sandbox === true
			? { kind: "sub", info, secretKey }
			: { kind: "main", info };
	} catch (error) {
		// A rejected key is a missing key; a server that cannot be reached is not.
		if (
			error instanceof AutumnApiError &&
			(error.status === 401 || error.status === 403)
		)
			return { kind: "missing" };
		throw error;
	}
};

/**
 * A sub-sandbox key in AUTUMN_SECRET_KEY was the user working inside that
 * sandbox; it keeps working under its own name, and the pin keeps them there.
 */
const relocateSubKey = ({
	check,
	envDirs,
	prompter,
}: {
	check: Extract<KeyCheck, { kind: "sub" }>;
	envDirs: string[];
	prompter: Prompter;
}): void => {
	const keyName = sandboxKeyName({ sandboxId: check.info.id });
	removeEnvValues({ dirs: envDirs, keys: ["AUTUMN_SECRET_KEY"] });
	writeEnvValues({
		dirs: envDirs,
		values: { [keyName]: check.secretKey, [SANDBOX_PIN_NAME]: check.info.id },
	});
	delete process.env.AUTUMN_SECRET_KEY;
	prompter.write(
		`${done(`Kept the sandbox key as ${keyName} and pinned ${SANDBOX_PIN_NAME}=${check.info.id}`)}\n`,
	);
};

const authenticate = async ({
	envDirs,
	login,
	deps,
	prompter,
}: {
	envDirs: string[];
	login: boolean | undefined;
	deps: InitDeps;
	prompter: Prompter;
}): Promise<OrgInfo> => {
	const check = await checkMainKey({ deps });
	if (check.kind === "main") {
		prompter.write(
			`${done(`Logged in as ${check.info.name} (${check.info.slug})`)}\n`,
		);
		return check.info;
	}

	if (check.kind === "sub") {
		prompter.write(
			`${soft(`AUTUMN_SECRET_KEY belongs to sandbox "${check.info.name}" (${check.info.id}), not your main sandbox.`)}\n`,
		);
		prompter.write(
			`  atmn needs your main sandbox key. Logging in mints it; the sandbox key is kept as ${sandboxKeyName({ sandboxId: check.info.id })} and pinned.\n`,
		);
	} else {
		prompter.write(`${soft("No AUTUMN_SECRET_KEY found.")}\n`);
	}

	const proceed = await confirm({
		prompter,
		value: login,
		question: "Log in to Autumn?",
		flag: "--login",
	});
	if (!proceed) throw new Error("atmn init needs your main sandbox key.");

	if (check.kind === "sub") relocateSubKey({ check, envDirs, prompter });
	await deps.login({ envDirs });
	// A rejected key exported in the shell would otherwise shadow the one
	// login just wrote, since env files never override the process.
	delete process.env.AUTUMN_SECRET_KEY;
	loadEnvFiles({ dirs: envDirs });

	const after = await checkMainKey({ deps });
	if (after.kind !== "main")
		throw new Error(
			"Login finished but AUTUMN_SECRET_KEY still does not answer as your main sandbox.",
		);
	prompter.write(
		`${done(`Logged in as ${after.info.name} (${after.info.slug})`)}\n`,
	);
	return after.info;
};

const readJson = (path: string): Record<string, unknown> =>
	JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

const writeJson = (path: string, value: Record<string, unknown>): void =>
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");

const packageJsonFor = ({
	name,
	dependencySpec,
}: {
	name: string;
	dependencySpec: string;
}): Record<string, unknown> => ({
	name,
	private: true,
	type: "module",
	dependencies: { [PACKAGE_NAME]: dependencySpec },
});

/** A repo with no package.json gets a minimal one: the config needs a package to depend from. */
const ensureRootManifest = ({ repoRoot }: { repoRoot: string }): string => {
	const manifestPath = join(repoRoot, "package.json");
	if (!existsSync(manifestPath))
		writeJson(manifestPath, { name: "autumn", private: true, type: "module" });
	return manifestPath;
};

/** The config imports the CLI, so whichever package owns it depends on it.
 * True when the manifest changed. */
const addDependency = ({
	manifestPath,
	dependencySpec,
}: {
	manifestPath: string;
	dependencySpec: string;
}): boolean => {
	if (!existsSync(manifestPath)) return false;
	const manifest = readJson(manifestPath);
	const deps = (manifest.dependencies ?? {}) as Record<string, string>;
	const devDeps = (manifest.devDependencies ?? {}) as Record<string, string>;
	if (deps[PACKAGE_NAME] !== undefined || devDeps[PACKAGE_NAME] !== undefined)
		return false;
	writeJson(manifestPath, {
		...manifest,
		dependencies: { ...deps, [PACKAGE_NAME]: dependencySpec },
	});
	return true;
};

/** The root's marker and script, added beside whatever is already there. */
const writeRootMarker = ({
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
			atmn: `${PACKAGE_NAME} -c ${JSON.stringify(config)}`,
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

const packageManager = ({ repoRoot }: { repoRoot: string }): string => {
	if (
		existsSync(join(repoRoot, "bun.lock")) ||
		existsSync(join(repoRoot, "bun.lockb"))
	)
		return "bun";
	if (existsSync(join(repoRoot, "pnpm-lock.yaml"))) return "pnpm";
	if (existsSync(join(repoRoot, "yarn.lock"))) return "yarn";
	return "npm";
};

const runnerFor = (manager: string): string =>
	manager === "npm" ? "npm run" : manager === "yarn" ? "yarn" : manager;

/**
 * Auth, path, pull, skills, next steps. Every step prints what it did; a
 * step that needs an answer prints what to pass and stops, so running the
 * same command again with the flag continues from there.
 */
export const runInit = async ({
	cwd = process.cwd(),
	dependencySpec = `^${version}`,
	path,
	name,
	login,
	deps,
	prompter,
}: InitOptions): Promise<InitResult> => {
	const { repoRoot, hasWorkspaces } = findRepoLayout({ cwd });
	const envDirs = [repoRoot];
	loadEnvFiles({ dirs: envDirs });

	const org = await authenticate({ envDirs, login, deps, prompter });

	let configDir = cwd;
	let packageName: string | undefined;
	// A repo init already placed keeps its answer: the marker is the path.
	const marker = readMarker({ repoRoot });
	if (hasWorkspaces) {
		prompter.write(`${done("Monorepo detected")}\n`);
		const chosen = await ask({
			prompter,
			value:
				path ??
				(marker === null
					? undefined
					: dirname(resolve(repoRoot, marker.config))),
			question: "Where should the Autumn package live?",
			flag: "--path <dir>",
			example: `--path ${DEFAULT_PACKAGE_DIR}`,
			defaultValue: DEFAULT_PACKAGE_DIR,
		});
		configDir = resolve(repoRoot, chosen);
		prompter.write(`${done(`Path ${relative(repoRoot, configDir) || "."}`)}\n`);
		const existingName = existsSync(join(configDir, "package.json"))
			? (readJson(join(configDir, "package.json")).name as string | undefined)
			: undefined;
		packageName = await ask({
			prompter,
			value: name ?? existingName,
			question: "Package name?",
			flag: "--name <name>",
			example: "--name @acme/autumn",
			defaultValue: DEFAULT_PACKAGE_NAME,
		});
		prompter.write(`${done(`Name ${packageName}`)}\n`);
	}

	const configPath = join(configDir, "autumn.config.ts");
	mkdirSync(configDir, { recursive: true });
	const wrote: string[] = [];
	let dependencyAdded = false;
	const manifestPath = join(configDir, "package.json");
	if (packageName !== undefined && !existsSync(manifestPath)) {
		writeJson(
			manifestPath,
			packageJsonFor({ name: packageName, dependencySpec }),
		);
		wrote.push(`${relative(repoRoot, manifestPath)}`);
		dependencyAdded = true;
	} else if (
		addDependency({
			manifestPath: existsSync(manifestPath)
				? manifestPath
				: ensureRootManifest({ repoRoot }),
			dependencySpec,
		})
	) {
		dependencyAdded = true;
		prompter.write(`${done(`Added ${PACKAGE_NAME} to package.json`)}\n`);
	}
	if (!existsSync(configPath)) {
		scaffoldConfig({ directory: configDir });
		wrote.push("autumn.config.ts", "planVersions/");
	}
	if (wrote.length > 0)
		prompter.write(`${done(`Wrote ${wrote.join(", ")}`)}\n`);
	if (writeRootMarker({ repoRoot, configPath }))
		prompter.write(
			`${done('Wrote "atmn" script and marker to package.json')}\n`,
		);

	const manager = packageManager({ repoRoot });
	const runner = runnerFor(manager);
	// The scaffolded config imports the CLI; a package written a moment ago
	// cannot resolve it until its dependency is installed.
	if (dependencyAdded) {
		const installed = await deps.install({ manager, repoRoot });
		if (!installed)
			throw new Error(
				`${manager} install failed; run it yourself, then atmn init again.`,
			);
		prompter.write(`${done(`Installed with ${manager}`)}\n`);
	}

	const pulled = await deps.pull({ configDir });
	const count =
		pulled.appended.length + pulled.replaced.length + pulled.deleted.length;
	prompter.write(
		`${done(count === 0 ? "Sandbox matches the config; nothing to pull" : `Pulled ${count} ${count === 1 ? "entry" : "entries"}`)}\n`,
	);

	const skillsDir = join(configDir, SKILLS_DIR_NAME);
	const { written } = installSkills({ dir: skillsDir, write: () => {} });
	prompter.write(
		`${done(`Skills: ${relative(repoRoot, skillsDir)}/${written.join(", ")}`)}\n`,
	);

	prompter.write("\nNext:\n");
	prompter.write(
		`${hint(`${runner} atmn push`)}          preview your catalog against the sandbox\n`,
	);
	prompter.write(
		`${hint(`npx skills add ${relative(repoRoot, skillsDir)} -y`)}      make the skills visible to your agent\n`,
	);

	return { repoRoot, configDir, configPath, org };
};
