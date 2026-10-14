import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

type TransitionRulesResponse = {
	carry_over_usages: { enabled: boolean; feature_ids?: string[] } | null;
};

test(`${chalk.yellowBright("transition-rules api: get, upsert, scope by feature_ids, clear")}`, async () => {
	const { ctx } = await initScenario({ setup: [], actions: [] });
	const autumn = new AutumnInt({ secretKey: ctx.orgSecretKey });

	try {
		const initial = (await autumn.get(
			"/organization/transition_rules",
		)) as TransitionRulesResponse;
		expect(initial.carry_over_usages).toBeNull();

		const enabled = (await autumn.patch("/organization/transition_rules", {
			carry_over_usages: { enabled: true },
		})) as TransitionRulesResponse;
		expect(enabled.carry_over_usages).toEqual({ enabled: true });

		const afterEnable = (await autumn.get(
			"/organization/transition_rules",
		)) as TransitionRulesResponse;
		expect(afterEnable.carry_over_usages).toEqual({ enabled: true });

		const scoped = (await autumn.patch("/organization/transition_rules", {
			carry_over_usages: {
				enabled: true,
				feature_ids: [TestFeature.Messages],
			},
		})) as TransitionRulesResponse;
		expect(scoped.carry_over_usages).toEqual({
			enabled: true,
			feature_ids: [TestFeature.Messages],
		});

		const afterScope = (await autumn.get(
			"/organization/transition_rules",
		)) as TransitionRulesResponse;
		expect(afterScope.carry_over_usages?.feature_ids).toEqual([
			TestFeature.Messages,
		]);

		const cleared = (await autumn.patch("/organization/transition_rules", {
			carry_over_usages: null,
		})) as TransitionRulesResponse;
		expect(cleared.carry_over_usages).toBeNull();

		const afterClear = (await autumn.get(
			"/organization/transition_rules",
		)) as TransitionRulesResponse;
		expect(afterClear.carry_over_usages).toBeNull();
	} finally {
		await autumn
			.patch("/organization/transition_rules", { carry_over_usages: null })
			.catch(() => undefined);
	}
});
