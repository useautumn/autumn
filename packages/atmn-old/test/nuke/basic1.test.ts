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

const QUOTED_CLI_PATH = `"${CLI_PATH}"`;
const BASIC_CONFIG_PATH = join(FIXTURES_PATH, "basic-config");

describe("nuke command", () => {
	afterEach(async () => {
		await cleanup();
	});

	test("prompts for confirmation and nukes sandbox", async () => {
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

		const featuresBefore = await getFeatures();
		const plansBefore = await getAllPlans();
		expect(featuresBefore.length).toBeGreaterThan(0);
		expect(plansBefore.length).toBeGreaterThan(0);

		const instance = await render("node", [QUOTED_CLI_PATH, "nuke"], {
			spawnOpts,
		});

		await waitFor(
			() => {
				const stdout = instance.stdoutArr
					.map((s) => s.contents.toString())
					.join("");
				expect(stdout).toMatch(/backup/i);
			},
			{ timeout: 10000 },
		);

		await instance.userEvent.keyboard("n[Enter]");

		await waitFor(
			() => {
				const stdout = instance.stdoutArr
					.map((s) => s.contents.toString())
					.join("");
				expect(stdout).toMatch(/confirm to continue/i);
			},
			{ timeout: 10000 },
		);

		await instance.userEvent.keyboard("y[Enter]");

		await waitFor(
			() => {
				const stdout = instance.stdoutArr
					.map((s) => s.contents.toString())
					.join("");
				expect(stdout).toMatch(/final confirmation/i);
			},
			{ timeout: 10000 },
		);

		await instance.userEvent.keyboard("y[Enter]");

		await waitFor(
			() => {
				const exit = instance.hasExit();
				expect(exit).toBeTruthy();
			},
			{ timeout: 30000 },
		);

		const stdout = instance.stdoutArr
			.map((s) => s.contents.toString())
			.join("");
		expect(stdout).toMatch(/deleted|nuked|success/i);

		const featuresAfter = await getFeatures();
		const plansAfter = await getAllPlans();

		expect(featuresAfter.length).toBe(0);
		expect(plansAfter.length).toBe(0);
	});
});
