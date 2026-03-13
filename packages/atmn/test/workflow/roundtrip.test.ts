import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "cli-testing-library";
import {
	CLI_PATH,
	cleanupTempDir,
	createTempDir,
	existsSync,
	type Feature,
	FIXTURES_PATH,
	getAllPlans,
	getFeatures,
	join,
	type Plan,
	readFileSync,
	spawnOpts,
} from "../setup";

const BASIC_CONFIG_PATH = join(FIXTURES_PATH, "basic-config");

// Quote the CLI_PATH for shell execution (cli-testing-library uses shell: true)
const QUOTED_CLI_PATH = `"${CLI_PATH}"`;

describe("full workflow", () => {
	let pullTempDir: string;

	afterAll(() => {
		if (pullTempDir) {
			cleanupTempDir(pullTempDir);
		}
	});

	afterEach(async () => {
		await cleanup();
	});

	test("nuke -> push -> pull roundtrip", async () => {
		// Step 1: Nuke to start fresh
		const nukeInstance = await render("node", [QUOTED_CLI_PATH, "nuke"], {
			spawnOpts,
		});

		// Wait for backup prompt (comes first now) then answer
		await waitFor(
			() => {
				const stdout = nukeInstance.stdoutArr
					.map((s) => s.contents.toString())
					.join("");
				expect(stdout).toMatch(/backup/i);
			},
			{ timeout: 10000 },
		);

		// Skip backup (n + Enter)
		await nukeInstance.userEvent.keyboard("n[Enter]");

		// Wait for first confirmation prompt then answer
		await waitFor(
			() => {
				const stdout = nukeInstance.stdoutArr
					.map((s) => s.contents.toString())
					.join("");
				expect(stdout).toMatch(/confirm to continue/i);
			},
			{ timeout: 10000 },
		);

		await nukeInstance.userEvent.keyboard("y[Enter]");

		// Wait for final confirmation prompt then answer
		await waitFor(
			() => {
				const stdout = nukeInstance.stdoutArr
					.map((s) => s.contents.toString())
					.join("");
				expect(stdout).toMatch(/final confirmation/i);
			},
			{ timeout: 10000 },
		);

		await nukeInstance.userEvent.keyboard("y[Enter]");

		// Wait for nuke to complete
		await waitFor(
			() => {
				const exit = nukeInstance.hasExit();
				expect(exit).toBeTruthy();
			},
			{ timeout: 30000 },
		);
		await cleanup();

		// VERIFY STATE: Everything should be deleted after nuke
		const featuresAfterNuke = await getFeatures();
		const plansAfterNuke = await getAllPlans();
		expect(featuresAfterNuke.length).toBe(0);
		expect(plansAfterNuke.length).toBe(0);

		// Step 2: Push our fixture config
		const pushInstance = await render("node", [QUOTED_CLI_PATH, "push", "-y"], {
			cwd: BASIC_CONFIG_PATH,
			spawnOpts,
		});

		// Wait for push to complete
		await waitFor(
			() => {
				const exit = pushInstance.hasExit();
				expect(exit).toBeTruthy();
			},
			{ timeout: 30000 },
		);

		const pushStdout = pushInstance.stdoutArr
			.map((s) => s.contents.toString())
			.join("");
		expect(pushStdout).toMatch(/Success/i);
		await cleanup();

		// VERIFY STATE: Features and plans should exist after push
		const featuresAfterPush = await getFeatures();
		const plansAfterPush = await getAllPlans();

		expect(featuresAfterPush.length).toBeGreaterThan(0);
		expect(plansAfterPush.length).toBeGreaterThan(0);

		// Verify specific feature
		const messagesFeature = featuresAfterPush.find(
			(f: Feature) => f.id === "messages",
		);
		expect(messagesFeature).toBeDefined();
		expect(messagesFeature?.name).toBe("Messages");

		// Verify specific plan
		const proPlan = plansAfterPush.find((p: Plan) => p.id === "pro");
		expect(proPlan).toBeDefined();
		expect(proPlan?.name).toBe("Pro");

		// Step 3: Pull into fresh directory
		pullTempDir = createTempDir("atmn-roundtrip-");

		const pullInstance = await render("node", [QUOTED_CLI_PATH, "pull"], {
			cwd: pullTempDir,
			spawnOpts,
		});

		// Wait for pull to complete
		await waitFor(
			() => {
				const exit = pullInstance.hasExit();
				expect(exit).toBeTruthy();
			},
			{ timeout: 30000 },
		);

		// Verify the pulled config file exists
		const configPath = join(pullTempDir, "autumn.config.ts");
		expect(existsSync(configPath)).toBe(true);

		// Verify pulled config contains our feature and plan
		const configContent = readFileSync(configPath, "utf-8");
		expect(configContent).toContain("messages");
		expect(configContent).toContain("pro");
		expect(configContent).toContain("Messages"); // feature name
		expect(configContent).toContain("Pro"); // plan name
	});
});
