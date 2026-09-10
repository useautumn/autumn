/**
 * atmn init + sandbox use, end to end against a fresh org: the real CLI in a
 * fresh process, a real .env, and the real server. Headless throughout, since
 * that is the path an agent takes and the one whose output is the contract.
 *
 * Contract:
 *   C1  init in a single-package repo with the main key: logs in from .env,
 *       scaffolds the config, pulls the catalog into it, writes the skills and
 *       the root marker; a push from the repo root then finds the config
 *   C2  init in a monorepo, headless, is hint-driven: --path, then --name, then
 *       the package is written and `atmn -c` is not needed from the root
 *   C3  sandbox use <name> mints a key through sandboxes.create_key, pins the
 *       sandbox, and a push lands in the sandbox and not on the org
 *   C4  env --json reports the pin and isMaster; sandbox use --clear unpins
 *   C5  a sub-sandbox key in AUTUMN_SECRET_KEY makes init stop with the soft
 *       error and the --login / --keyless hint, without touching the repo
 */

import { expect, test } from "bun:test";
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
import {
	CLI_PACKAGE_DIR,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sandboxKeyName } from "../../../../../../packages/atmn-nightly/src/env/sandboxKeyName";
import { createClient } from "../../../../../../packages/atmn-nightly/src/generated/client";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const CLI_ENTRY = join(CLI_PACKAGE_DIR, "src/cli.ts");

/** The CLI in a fresh process, headless, with only the env the test states. */
const runCliHeadless = ({
	cwd,
	args,
	baseUrl,
	env = {},
}: {
	cwd: string;
	args: string[];
	baseUrl: string;
	env?: Record<string, string>;
}): { output: string; exitCode: number } => {
	const result = Bun.spawnSync(["bun", CLI_ENTRY, "--headless", ...args], {
		cwd,
		env: {
			PATH: process.env.PATH ?? "",
			HOME: process.env.HOME ?? "",
			AUTUMN_BASE_URL: baseUrl,
			// A package init writes depends on the CLI; from source that is this checkout.
			ATMN_INIT_DEPENDENCY: `file:${CLI_PACKAGE_DIR}`,
			NO_COLOR: "1",
			FORCE_COLOR: "0",
			...env,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
		exitCode: result.exitCode,
	};
};

const envValue = ({
	cwd,
	key,
}: {
	cwd: string;
	key: string;
}): string | undefined =>
	readFileSync(join(cwd, ".env"), "utf8")
		.split("\n")
		.find((line) => line.startsWith(`${key}=`))
		?.slice(key.length + 1);

/** A repo of its own: init's whole job is what it writes into one. */
const makeRepo = ({
	monorepo,
	secretKey,
}: {
	monorepo: boolean;
	secretKey: string;
}): string => {
	// Outside the autumn checkout: `git rev-parse` must find this repo, not ours.
	const root = mkdtempSync(join(tmpdir(), "atmn-init-"));
	Bun.spawnSync(["git", "init", "-q"], { cwd: root });
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify(
			{ name: "app", ...(monorepo ? { workspaces: ["packages/*"] } : {}) },
			null,
			"\t",
		),
	);
	writeFileSync(join(root, ".env"), `AUTUMN_SECRET_KEY=${secretKey}\n`);
	return root;
};

const liveFeatureIds = async ({
	secretKey,
	baseUrl,
}: {
	secretKey: string;
	baseUrl: string;
}): Promise<string[]> => {
	const catalog = (await createClient({ secretKey, baseUrl }).get(
		{},
	)) as unknown as {
		features: { id: string; archived?: boolean | null }[];
	};
	return catalog.features
		.filter((feature) => feature.archived !== true)
		.map((feature) => feature.id)
		.sort();
};

test(`${chalk.yellowBright("atmn init: single repo pulls the catalog, writes skills and the marker")}`, async () => {
	const messages = uniqueTestId("atmn_init_messages");
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({
				userEmail: `${uniqueTestId("atmn_init")}@autumn.test`,
			}),
		],
		config: `{ features: [
			feature({ featureId: "${messages}", name: "Messages", type: "metered", consumable: true }),
		] }`,
	});
	const { secretKey, baseUrl } = scenario;
	// Seed the org through the scenario's own config so init has something to pull.
	scenario.writeFile(".env", "");
	await scenario.push();

	const root = makeRepo({ monorepo: false, secretKey });
	try {
		const { output, exitCode } = runCliHeadless({
			cwd: root,
			args: ["init"],
			baseUrl,
		});
		expect(exitCode).toBe(0);
		expect(output).toContain("✓ Logged in as");
		expect(output).toContain("✓ Wrote autumn.config.ts, planVersions/");
		expect(output).toContain("✓ Added atmn-nightly to package.json");
		expect(output).toContain("✓ Installed with npm");
		expect(output).toContain(
			'✓ Wrote "atmn" script and marker to package.json',
		);
		expect(output).toContain("✓ Pulled 1 entry");
		expect(output).toContain(
			"✓ Skills: skills/autumn-setup, autumn-catalog, autumn-integrate, autumn-concepts",
		);

		expect(readFileSync(join(root, "autumn.config.ts"), "utf8")).toContain(
			messages,
		);
		expect(existsSync(join(root, "skills/autumn-catalog/SKILL.md"))).toBe(true);
		const manifest = JSON.parse(
			readFileSync(join(root, "package.json"), "utf8"),
		);
		expect(manifest.atmn).toEqual({ config: "autumn.config.ts" });

		// C5 — the marker means a plain push from the root finds the config.
		const pushed = runCliHeadless({ cwd: root, args: ["push"], baseUrl });
		expect(pushed.exitCode).toBe(0);
		expect(pushed.output).not.toContain("No autumn.config.ts found");
	} finally {
		rmSync(root, { recursive: true, force: true });
		scenario.cleanup();
	}
}, 600_000);

test(`${chalk.yellowBright("atmn init: a monorepo is hint-driven headless, and the package it writes works from the root")}`, async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({
				userEmail: `${uniqueTestId("atmn_init_mono")}@autumn.test`,
			}),
		],
		config: `{ features: [] }`,
	});
	const { secretKey, baseUrl } = scenario;
	const root = makeRepo({ monorepo: true, secretKey });
	try {
		const first = runCliHeadless({ cwd: root, args: ["init"], baseUrl });
		expect(first.exitCode).toBe(0);
		expect(first.output).toContain("✓ Monorepo detected");
		expect(first.output).toContain("→ Where should the Autumn package live?");
		expect(first.output).toContain("Provide --path <dir>");
		expect(existsSync(join(root, "packages"))).toBe(false);

		const second = runCliHeadless({
			cwd: root,
			args: ["init", "--path", "packages/autumn"],
			baseUrl,
		});
		expect(second.output).toContain("✓ Path packages/autumn");
		expect(second.output).toContain("→ Package name?");

		const third = runCliHeadless({
			cwd: root,
			args: ["init", "--path", "packages/autumn", "--name", "@app/autumn"],
			baseUrl,
		});
		expect(third.exitCode).toBe(0);
		expect(third.output).toContain("✓ Name @app/autumn");
		expect(third.output).toContain(
			"Sandbox matches the config; nothing to pull",
		);
		const pkg = JSON.parse(
			readFileSync(join(root, "packages/autumn/package.json"), "utf8"),
		);
		expect(pkg.name).toBe("@app/autumn");
		expect(existsSync(join(root, "packages/autumn/autumn.config.ts"))).toBe(
			true,
		);
		const manifest = JSON.parse(
			readFileSync(join(root, "package.json"), "utf8"),
		);
		expect(manifest.atmn).toEqual({
			config: "packages/autumn/autumn.config.ts",
		});
		expect(manifest.scripts.atmn).toBe(
			'atmn-nightly -c "packages/autumn/autumn.config.ts"',
		);

		// From the root, with no -c, the marker resolves the package's config.
		const pushed = runCliHeadless({ cwd: root, args: ["push"], baseUrl });
		expect(pushed.exitCode).toBe(0);
		expect(pushed.output).not.toContain("No autumn.config.ts found");
	} finally {
		rmSync(root, { recursive: true, force: true });
		scenario.cleanup();
	}
}, 600_000);

test(`${chalk.yellowBright("atmn sandbox use: mints a key, pins, redirects push; --clear unpins; a sub key stops init")}`, async () => {
	const messages = uniqueTestId("atmn_use_messages");
	const sandboxName = uniqueTestId("atmn-use");
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({
				userEmail: `${uniqueTestId("atmn_use")}@autumn.test`,
			}),
		],
		config: `{ features: [
			feature({ featureId: "${messages}", name: "Messages", type: "metered", consumable: true }),
		] }`,
	});
	const { cwd, secretKey, baseUrl, client } = scenario;
	scenario.writeFile(".env", `AUTUMN_SECRET_KEY=${secretKey}\n`);
	const atmn = (args: string[]) => runCliHeadless({ cwd, args, baseUrl });
	let createdId: string | undefined;

	try {
		// A sandbox this machine holds no key for: created through the API, not the CLI.
		const created = await client.createSandbox({ name: sandboxName });
		createdId = created.id;

		// C3 — headless with no argument: table and hint, nothing written.
		const listed = atmn(["sandbox", "use"]);
		expect(listed.exitCode).toBe(0);
		expect(listed.output).toContain(sandboxName);
		expect(listed.output).toContain("atmn sandbox use <name|id>");
		expect(envValue({ cwd, key: "AUTUMN_SANDBOX_ID" })).toBeUndefined();

		const used = atmn(["sandbox", "use", sandboxName]);
		expect(used.exitCode).toBe(0);
		expect(used.output).toContain(
			`✓ Minted a key for ${sandboxName} (${created.id})`,
		);
		expect(used.output).toContain(`✓ Pinned AUTUMN_SANDBOX_ID=${created.id}`);
		const keyName = sandboxKeyName({ sandboxId: created.id });
		const sandboxKey = envValue({ cwd, key: keyName });
		expect(sandboxKey?.startsWith("am_sk_test")).toBe(true);
		expect(envValue({ cwd, key: "AUTUMN_SANDBOX_ID" })).toBe(created.id);

		// The pin redirects push: the sandbox gets the feature, the org does not.
		const pushed = atmn(["push", "--yes"]);
		expect(pushed.exitCode).toBe(0);
		expect(
			await liveFeatureIds({ secretKey: sandboxKey ?? "", baseUrl }),
		).toEqual([messages]);
		expect(await liveFeatureIds({ secretKey, baseUrl })).toEqual([]);

		// A second use does not mint again.
		const again = atmn(["sandbox", "use", created.id, "--json"]);
		const parsed = JSON.parse(again.output);
		expect(parsed.keyMinted).toBe(false);
		expect(parsed.sandbox.id).toBe(created.id);
		expect(parsed.notes.length).toBeGreaterThan(0);

		// C4 — env --json sees the pin, and says the key in use is the sandbox's own.
		const env = JSON.parse(atmn(["env", "--json"]).output);
		expect(env.sandbox).toEqual({
			id: created.id,
			authenticatedAs: created.id,
		});
		expect(env.isMaster).toBe(false);
		expect(env.organization.id).toBe(created.id);
		expect(env.keyName).toBe(keyName);

		const cleared = atmn(["sandbox", "use", "--clear"]);
		expect(cleared.output).toContain("✓ Cleared AUTUMN_SANDBOX_ID");
		expect(envValue({ cwd, key: "AUTUMN_SANDBOX_ID" })).toBeUndefined();
		expect(envValue({ cwd, key: keyName })).toBe(sandboxKey);

		// C5 — init with the sub key in AUTUMN_SECRET_KEY: soft error, connect hint, no files.
		const root = makeRepo({ monorepo: false, secretKey: sandboxKey ?? "" });
		try {
			const before = {
				env: readFileSync(join(root, ".env"), "utf8"),
				manifest: readFileSync(join(root, "package.json"), "utf8"),
			};
			const init = runCliHeadless({ cwd: root, args: ["init"], baseUrl });
			expect(init.exitCode).toBe(0);
			expect(init.output).toContain(
				`! AUTUMN_SECRET_KEY belongs to sandbox "${sandboxName}" (${created.id}), not your main sandbox.`,
			);
			expect(init.output).toContain("→ How do you want to connect to Autumn?");
			expect(init.output).toContain("--login    ");
			expect(init.output).toContain("--keyless  ");
			expect(existsSync(join(root, "autumn.config.ts"))).toBe(false);
			expect(readFileSync(join(root, ".env"), "utf8")).toBe(before.env);
			expect(readFileSync(join(root, "package.json"), "utf8")).toBe(
				before.manifest,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	} finally {
		// A failed delete is a real failure, not something to hide.
		try {
			if (createdId !== undefined)
				await client.deleteSandbox({ id: createdId });
		} finally {
			scenario.cleanup();
		}
	}
}, 600_000);
