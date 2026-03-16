import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "cli-testing-library";
import {
	CLI_PATH,
	FIXTURES_PATH,
	getAllPlans,
	getFeatures,
	join,
	spawnOpts,
} from "../setup";

// Quote the CLI_PATH for shell execution (cli-testing-library uses shell: true)
const QUOTED_CLI_PATH = `"${CLI_PATH}"`;
const BASIC_CONFIG_PATH = join(FIXTURES_PATH, "basic-config");

describe("nuke command", () => {
	afterEach(async () => {
		await cleanup();
	});

	test("prompts for confirmation and nukes sandbox", async () => {
		// First push some data so we have something to nuke
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
		await cleanup();

		// Verify data exists before nuke
		const featuresBefore = await getFeatures();
		const plansBefore = await getAllPlans();
		expect(featuresBefore.length).toBeGreaterThan(0);
		expect(plansBefore.length).toBeGreaterThan(0);

		// Now nuke
		const instance = await render("node", [QUOTED_CLI_PATH, "nuke"], {
			spawnOpts,
		});

		// Wait for backup prompt (comes first now) then answer
		await waitFor(
			() => {
				const stdout = instance.stdoutArr
					.map((s) => s.contents.toString())
					.join("");
				expect(stdout).toMatch(/backup/i);
			},
			{ timeout: 10000 },
		);

		// Skip backup (n + Enter)
		await instance.userEvent.keyboard("n[Enter]");

		// Wait for first confirmation prompt then answer
		await waitFor(
			() => {
				const stdout = instance.stdoutArr
					.map((s) => s.contents.toString())
					.join("");
				expect(stdout).toMatch(/confirm to continue/i);
			},
			{ timeout: 10000 },
		);

		// Confirm first prompt (y + Enter)
		await instance.userEvent.keyboard("y[Enter]");

		// Wait for final confirmation prompt then answer
		await waitFor(
			() => {
				const stdout = instance.stdoutArr
					.map((s) => s.contents.toString())
					.join("");
				expect(stdout).toMatch(/final confirmation/i);
			},
			{ timeout: 10000 },
		);

		// Confirm final prompt (y + Enter)
		await instance.userEvent.keyboard("y[Enter]");

		// Wait for process to exit
		await waitFor(
			() => {
				const exit = instance.hasExit();
				expect(exit).toBeTruthy();
			},
			{ timeout: 30000 },
		);

		// Check for success in output
		const stdout = instance.stdoutArr
			.map((s) => s.contents.toString())
			.join("");
		expect(stdout).toMatch(/deleted|nuked|success/i);

		// VERIFY ACTUAL STATE: All features and plans should be deleted
		const featuresAfter = await getFeatures();
		const plansAfter = await getAllPlans();

		expect(featuresAfter.length).toBe(0);
		expect(plansAfter.length).toBe(0);
	});
});
