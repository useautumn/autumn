import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "cli-testing-library";
import {
	CLI_PATH,
	type Feature,
	FIXTURES_PATH,
	getAllPlans,
	getFeatures,
	join,
	spawnOpts,
} from "../setup";

const BASIC_CONFIG_PATH = join(FIXTURES_PATH, "basic-config");

const QUOTED_CLI_PATH = `"${CLI_PATH}"`;

describe("push command", () => {
	afterEach(async () => {
		await cleanup();
	});

	test("pushes features and plans from config", async () => {
		const instance = await render("node", [QUOTED_CLI_PATH, "push", "-y"], {
			cwd: BASIC_CONFIG_PATH,
			spawnOpts,
		});

		await waitFor(
			() => {
				const exit = instance.hasExit();
				expect(exit).toBeTruthy();
				expect(exit?.exitCode).toBe(0);
			},
			{ timeout: 30000 },
		);

		const features = await getFeatures();
		const plans = await getAllPlans();

		expect(features.length).toBeGreaterThan(0);
		expect(plans.length).toBeGreaterThan(0);
	});

	test("creates features with correct properties", async () => {
		const instance = await render("node", [QUOTED_CLI_PATH, "push", "-y"], {
			cwd: BASIC_CONFIG_PATH,
			spawnOpts,
		});

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
		expect(stdout).toMatch(/Features pushed:/i);
		expect(stdout).toMatch(/messages/i);

		const features = await getFeatures();
		const messagesFeature = features.find((f: Feature) => f.id === "messages");

		expect(messagesFeature).toBeDefined();
		expect(messagesFeature?.name).toBe("Messages");
		expect(messagesFeature?.type).toBe("metered");
	});

	test("creates plans with correct properties", async () => {
		const instance = await render("node", [QUOTED_CLI_PATH, "push", "-y"], {
			cwd: BASIC_CONFIG_PATH,
			spawnOpts,
		});

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
		expect(stdout).toMatch(/Plans pushed:/i);
		expect(stdout).toMatch(/pro/i);

		const plans = await getAllPlans();
		const proPlan = plans.find((p: { id: string }) => p.id === "pro");

		expect(proPlan).toBeDefined();
		expect(proPlan?.name).toBe("Pro");

		const planFeatures = (
			proPlan as {
				features: {
					feature_id: string;
					granted_balance: number;
					reset?: { interval: string };
				}[];
			}
		)?.features;
		expect(planFeatures).toBeDefined();
		expect(planFeatures?.length).toBeGreaterThan(0);

		const messagesFeature = planFeatures?.find(
			(f: { feature_id: string }) => f.feature_id === "messages",
		);
		expect(messagesFeature).toBeDefined();
		expect(messagesFeature?.reset?.interval).toBe("month");
		expect(messagesFeature?.granted_balance).toBe(10);
	});
});
