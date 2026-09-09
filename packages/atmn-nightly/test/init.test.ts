/**
 * `atmn init`: auth → path → pull → skills → next steps, one code path for a
 * terminal and for an agent. The network is faked; the repo on disk is real.
 *
 * Contract:
 *   auth
 *     - main key on disk and valid          → "✓ Logged in as <org> (<slug>)"
 *     - no key                              → offer login (headless: hint --login, stop)
 *     - key answers as a sub-sandbox        → "!" soft error, offer login; after login the
 *                                             sub key moves to AUTUMN_SANDBOX_<ID>_SECRET_KEY
 *                                             and AUTUMN_SANDBOX_ID is pinned
 *   path
 *     - monorepo                            → --path and --name are asked (hinted headless)
 *     - single repo                         → config in cwd, no questions
 *     - monorepo writes package.json (dep on atmn-nightly), config + planVersions/,
 *       the root marker `"atmn": { "config" }` and an `"atmn"` root script
 *   pull
 *     - the pull runs against the config dir; its line count is reported
 *   skills
 *     - written to <config dir>/skills
 *   next steps
 *     - install, push, npx skills add
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { type InitDeps, runInit } from "../src/actions/init/runInit";
import { sandboxKeyName } from "../src/env/sandboxKeyName";
import { AutumnApiError } from "../src/generated/client";
import { SKILLS } from "../src/generated/skills";
import { createPrompter } from "../src/prompt/prompt";

chalk.level = 0;

const dirs: string[] = [];
/** A developer's own keys must not answer for the fakes. */
const clearAutumnEnv = () => {
	for (const key of Object.keys(process.env))
		if (key.startsWith("AUTUMN_")) delete process.env[key];
};
beforeEach(clearAutumnEnv);
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
	clearAutumnEnv();
});

const repo = ({
	monorepo,
	env,
}: {
	monorepo: boolean;
	env?: string;
}): string => {
	const root = mkdtempSync(join(tmpdir(), "atmn-init-"));
	dirs.push(root);
	mkdirSync(join(root, ".git"));
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify(
			{ name: "app", ...(monorepo ? { workspaces: ["packages/*"] } : {}) },
			null,
			"\t",
		),
	);
	if (env !== undefined) writeFileSync(join(root, ".env"), env);
	return root;
};

const org = {
	id: "org_main",
	name: "Acme",
	slug: "acme",
	env: "sandbox",
	is_sandbox: false,
};
const sub = {
	id: "id_pricing",
	name: "Pricing v2",
	slug: "pricing-v2",
	env: "sandbox",
	is_sandbox: true,
	created_by: "org_main",
};

const capture = () => {
	const lines: string[] = [];
	return { lines, write: (text: string) => lines.push(text) };
};

/** Fakes that record what init asked of them. */
const deps = ({
	keyAnswers = {},
}: {
	/** secret key → what /me says for it. */
	keyAnswers?: Record<string, typeof org | typeof sub>;
} = {}) => {
	const calls = { login: 0, pull: [] as string[], install: [] as string[] };
	const answers = { ...keyAnswers };
	const fake: InitDeps = {
		fetchOrgInfo: async ({ secretKey }) => {
			const answer = answers[secretKey];
			if (answer === undefined)
				throw new AutumnApiError({ status: 401, body: null, path: "/me" });
			return answer;
		},
		login: async ({ envDirs }) => {
			calls.login += 1;
			answers.am_sk_test_main = org;
			const { writeEnvValues } = await import("../src/env/loadEnv");
			const envPath = writeEnvValues({
				dirs: envDirs,
				values: {
					AUTUMN_SECRET_KEY: "am_sk_test_main",
					AUTUMN_PROD_SECRET_KEY: "am_sk_live_main",
				},
			});
			process.env.AUTUMN_SECRET_KEY = "am_sk_test_main";
			return {
				envPath,
				orgId: "org_main",
				writtenKeys: ["AUTUMN_SECRET_KEY", "AUTUMN_PROD_SECRET_KEY"],
			};
		},
		install: async ({ manager }) => {
			calls.install.push(manager);
			return true;
		},
		pull: async ({ configDir }) => {
			calls.pull.push(configDir);
			// Scaffolding is init's job; a pull that finds no config is a bug.
			if (!existsSync(join(configDir, "autumn.config.ts")))
				throw new Error("pull ran before the config was scaffolded");
			return { appended: ["messages", "pro"], replaced: [], deleted: [] };
		},
	};
	return { deps: fake, calls };
};

test("single repo, valid key: no questions, config in cwd, skills beside it", async () => {
	const root = repo({
		monorepo: false,
		env: "AUTUMN_SECRET_KEY=am_sk_test_main\n",
	});
	const { deps: d, calls } = deps({ keyAnswers: { am_sk_test_main: org } });
	const { lines, write } = capture();

	const result = await runInit({
		cwd: root,
		deps: d,
		prompter: createPrompter({ interactive: false, write }),
	});

	expect(calls.login).toBe(0);
	// The config imports the CLI, so the root package gains the dependency.
	expect(calls.install).toEqual(["npm"]);
	expect(calls.pull).toEqual([root]);
	expect(result.configDir).toBe(root);
	expect(existsSync(join(root, "autumn.config.ts"))).toBe(true);
	expect(existsSync(join(root, "planVersions"))).toBe(true);
	for (const skill of SKILLS)
		expect(existsSync(join(root, "skills", skill.name, "SKILL.md"))).toBe(true);
	const text = lines.join("");
	expect(text).toContain("✓ Logged in as Acme (acme)");
	expect(text).not.toContain("Monorepo");
	expect(text).toContain("✓ Pulled 2 entries");
	expect(text).toContain("✓ Skills:");
	expect(text).toContain("atmn push");
	// A single-package repo still gets the marker so `-c` stays optional.
	const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	expect(manifest.atmn).toEqual({ config: "autumn.config.ts" });
	expect(manifest.dependencies["atmn-nightly"]).toBeDefined();
	expect(text).toContain("✓ Added atmn-nightly to package.json");
	expect(text).toContain("npm run atmn push");
});

test("an expired key exported in the shell does not shadow the one login writes", async () => {
	const root = repo({ monorepo: false });
	process.env.AUTUMN_SECRET_KEY = "am_sk_test_expired";
	const { deps: d, calls } = deps();
	const { lines, write } = capture();

	await runInit({
		cwd: root,
		login: true,
		deps: d,
		prompter: createPrompter({ interactive: false, write }),
	});

	expect(calls.login).toBe(1);
	expect(lines.join("")).toContain("✓ Logged in as Acme (acme)");
});

test("a server error is not mistaken for a missing key", async () => {
	const root = repo({
		monorepo: false,
		env: "AUTUMN_SECRET_KEY=am_sk_test_main\n",
	});
	const { deps: d } = deps();
	d.fetchOrgInfo = async () => {
		throw new AutumnApiError({ status: 500, body: null, path: "/me" });
	};
	await expect(
		runInit({
			cwd: root,
			deps: d,
			prompter: createPrompter({ interactive: false, write: () => {} }),
		}),
	).rejects.toThrow(/500/);
});

test("an existing workspace package gains the dependency instead of a new manifest", async () => {
	const root = repo({
		monorepo: true,
		env: "AUTUMN_SECRET_KEY=am_sk_test_main\n",
	});
	mkdirSync(join(root, "packages/billing"), { recursive: true });
	writeFileSync(
		join(root, "packages/billing/package.json"),
		JSON.stringify({ name: "@acme/billing", dependencies: { left: "1.0.0" } }),
	);
	const { deps: d, calls } = deps({ keyAnswers: { am_sk_test_main: org } });

	await runInit({
		cwd: root,
		path: "packages/billing",
		deps: d,
		prompter: createPrompter({ interactive: false, write: () => {} }),
	});

	const pkg = JSON.parse(
		readFileSync(join(root, "packages/billing/package.json"), "utf8"),
	);
	expect(pkg.name).toBe("@acme/billing");
	expect(pkg.dependencies.left).toBe("1.0.0");
	expect(pkg.dependencies["atmn-nightly"]).toBeDefined();
	expect(calls.install).toEqual(["npm"]);
});

test("no key, headless: hints --login and stops before touching the repo", async () => {
	const root = repo({ monorepo: false });
	const { deps: d, calls } = deps();
	const { lines, write } = capture();

	await expect(
		runInit({
			cwd: root,
			deps: d,
			prompter: createPrompter({ interactive: false, write }),
		}),
	).rejects.toThrow(/--login/);

	expect(calls.login).toBe(0);
	expect(calls.pull).toEqual([]);
	expect(existsSync(join(root, "autumn.config.ts"))).toBe(false);
	expect(lines.join("")).toContain("→ Log in to Autumn?");
	expect(lines.join("")).toContain("Pass --login to continue");
});

test("no key, --login: logs in, then continues", async () => {
	const root = repo({ monorepo: false });
	const { deps: d, calls } = deps();
	const { lines, write } = capture();

	await runInit({
		cwd: root,
		login: true,
		deps: d,
		prompter: createPrompter({ interactive: false, write }),
	});

	expect(calls.login).toBe(1);
	expect(readFileSync(join(root, ".env"), "utf8")).toContain(
		"AUTUMN_SECRET_KEY=am_sk_test_main",
	);
	expect(lines.join("")).toContain("✓ Logged in as Acme (acme)");
});

test("a sub-sandbox key is relocated and pinned once the main key is minted", async () => {
	const root = repo({
		monorepo: false,
		env: "AUTUMN_SECRET_KEY=am_sk_test_sub\n",
	});
	process.env.AUTUMN_SECRET_KEY = "am_sk_test_sub";
	const { deps: d, calls } = deps({ keyAnswers: { am_sk_test_sub: sub } });
	const { lines, write } = capture();

	await runInit({
		cwd: root,
		login: true,
		deps: d,
		prompter: createPrompter({ interactive: false, write }),
	});

	expect(calls.login).toBe(1);
	const env = readFileSync(join(root, ".env"), "utf8");
	expect(env).toContain(
		`${sandboxKeyName({ sandboxId: "id_pricing" })}=am_sk_test_sub\n`,
	);
	expect(env).toContain("AUTUMN_SANDBOX_ID=id_pricing\n");
	expect(env).toContain("AUTUMN_SECRET_KEY=am_sk_test_main\n");
	const text = lines.join("");
	expect(text).toContain(
		'! AUTUMN_SECRET_KEY belongs to sandbox "Pricing v2" (id_pricing), not your main sandbox.',
	);
	expect(text).toContain(
		`✓ Kept the sandbox key as ${sandboxKeyName({ sandboxId: "id_pricing" })} and pinned AUTUMN_SANDBOX_ID=id_pricing`,
	);
	expect(text).toContain("✓ Logged in as Acme (acme)");
});

test("monorepo, headless: hints --path, then --name, then does everything", async () => {
	const root = repo({
		monorepo: true,
		env: "AUTUMN_SECRET_KEY=am_sk_test_main\n",
	});
	const d = () => deps({ keyAnswers: { am_sk_test_main: org } }).deps;

	const first = capture();
	await expect(
		runInit({
			cwd: root,
			deps: d(),
			prompter: createPrompter({ interactive: false, write: first.write }),
		}),
	).rejects.toThrow(/--path/);
	expect(first.lines.join("")).toContain("✓ Monorepo detected");
	expect(first.lines.join("")).toContain(
		"→ Where should the Autumn package live?",
	);

	const second = capture();
	await expect(
		runInit({
			cwd: root,
			path: "packages/autumn",
			deps: d(),
			prompter: createPrompter({ interactive: false, write: second.write }),
		}),
	).rejects.toThrow(/--name/);
	expect(second.lines.join("")).toContain("✓ Path packages/autumn");
	expect(second.lines.join("")).toContain("→ Package name?");

	const third = capture();
	const { deps: thirdDeps, calls } = deps({
		keyAnswers: { am_sk_test_main: org },
	});
	const result = await runInit({
		cwd: root,
		path: "packages/autumn",
		name: "@acme/autumn",
		deps: thirdDeps,
		prompter: createPrompter({ interactive: false, write: third.write }),
	});
	expect(calls.install).toEqual(["npm"]);

	const pkgDir = join(root, "packages/autumn");
	expect(result.configDir).toBe(pkgDir);
	const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
	expect(pkg.name).toBe("@acme/autumn");
	expect(pkg.private).toBe(true);
	expect(pkg.dependencies["atmn-nightly"]).toBeDefined();
	expect(existsSync(join(pkgDir, "autumn.config.ts"))).toBe(true);
	expect(existsSync(join(pkgDir, "planVersions"))).toBe(true);
	expect(existsSync(join(pkgDir, "skills"))).toBe(true);

	const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	expect(rootPkg.atmn).toEqual({ config: "packages/autumn/autumn.config.ts" });
	expect(rootPkg.scripts.atmn).toBe(
		'atmn-nightly -c "packages/autumn/autumn.config.ts"',
	);
	// The user's other fields survive.
	expect(rootPkg.workspaces).toEqual(["packages/*"]);

	const text = third.lines.join("");
	expect(text).toContain("✓ Name @acme/autumn");
	expect(text).toContain("✓ Wrote packages/autumn/package.json");
	expect(text).toContain('✓ Wrote "atmn" script and marker to package.json');
	expect(text).toContain("✓ Installed with npm");
	expect(text).toContain("npm run atmn push");
});

test("monorepo, interactive: enter accepts the suggested path and name", async () => {
	const root = repo({
		monorepo: true,
		env: "AUTUMN_SECRET_KEY=am_sk_test_main\n",
	});
	const { deps: d } = deps({ keyAnswers: { am_sk_test_main: org } });
	const answers = ["", ""];
	const { lines, write } = capture();

	const result = await runInit({
		cwd: root,
		deps: d,
		prompter: createPrompter({
			interactive: true,
			write,
			readLine: async () => answers.shift() ?? null,
		}),
	});

	expect(result.configDir).toBe(join(root, "packages/autumn"));
	const pkg = JSON.parse(
		readFileSync(join(root, "packages/autumn/package.json"), "utf8"),
	);
	expect(pkg.name).toBe("autumn");
	expect(lines.join("")).toContain("✓ Path packages/autumn");
});

test("a second init in the same repo is a no-op for the files it already wrote", async () => {
	const root = repo({
		monorepo: false,
		env: "AUTUMN_SECRET_KEY=am_sk_test_main\n",
	});
	const { deps: d } = deps({ keyAnswers: { am_sk_test_main: org } });
	await runInit({
		cwd: root,
		deps: d,
		prompter: createPrompter({ interactive: false, write: () => {} }),
	});
	writeFileSync(join(root, "autumn.config.ts"), "// edited\n");

	await runInit({
		cwd: root,
		deps: d,
		prompter: createPrompter({ interactive: false, write: () => {} }),
	});
	expect(readFileSync(join(root, "autumn.config.ts"), "utf8")).toBe(
		"// edited\n",
	);
});
