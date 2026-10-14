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
		const nukeInstance = await render("node", [QUOTED_CLI_PATH, "nuke"], {
			spawnOpts,
		});

		await waitFor(
			() => {
				const stdout = nukeInstance.stdoutArr
					.map((s) => s.contents.toString())
					.join("");
				expect(stdout).toMatch(/backup/i);
			},
			{ timeout: 10000 },
		);

		await nukeInstance.userEvent.keyboard("n[Enter]");

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

		await waitFor(
			() => {
				const exit = nukeInstance.hasExit();
				expect(exit).toBeTruthy();
			},
			{ timeout: 30000 },
		);
		await cleanup();

		const featuresAfterNuke = await getFeatures();
		const plansAfterNuke = await getAllPlans();
		expect(featuresAfterNuke.length).toBe(0);
		expect(plansAfterNuke.length).toBe(0);

		const pushInstance = await render("node", [QUOTED_CLI_PATH, "push", "-y"], {
			cwd: BASIC_CONFIG_PATH,
			spawnOpts,
		});

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

		const featuresAfterPush = await getFeatures();
		const plansAfterPush = await getAllPlans();

		expect(featuresAfterPush.length).toBeGreaterThan(0);
		expect(plansAfterPush.length).toBeGreaterThan(0);

		const messagesFeature = featuresAfterPush.find(
			(f: Feature) => f.id === "messages",
		);
		expect(messagesFeature).toBeDefined();
		expect(messagesFeature?.name).toBe("Messages");

		const proPlan = plansAfterPush.find((p: Plan) => p.id === "pro");
		expect(proPlan).toBeDefined();
		expect(proPlan?.name).toBe("Pro");

		pullTempDir = createTempDir("atmn-roundtrip-");

		const pullInstance = await render("node", [QUOTED_CLI_PATH, "pull"], {
			cwd: pullTempDir,
			spawnOpts,
		});

		await waitFor(
			() => {
				const exit = pullInstance.hasExit();
				expect(exit).toBeTruthy();
			},
			{ timeout: 30000 },
		);

		const configPath = join(pullTempDir, "autumn.config.ts");
		expect(existsSync(configPath)).toBe(true);

		const configContent = readFileSync(configPath, "utf-8");
		expect(configContent).toContain("messages");
		expect(configContent).toContain("pro");
		expect(configContent).toContain("Messages");
		expect(configContent).toContain("Pro");
	});
});
