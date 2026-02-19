import { test } from "bun:test";
import { ApiVersion, FreeTrialDuration, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_1 = new AutumnInt({ version: ApiVersion.V2_1 });
const { db, org, env } = ctx;

test.concurrent(`${chalk.yellowBright("temp: rest update then rpc inverse update returns product to baseline")}`, async () => {
	const productId = `temp_rpc_roundtrip_${Date.now()}`;
	const baselineGroup = `baseline_group_${productId}`;
	const changedGroup = `changed_group_${productId}`;

	const baseline = {
		name: "Temp RPC Baseline",
		description: "baseline description",
		group: baselineGroup,
		add_on: false,
		auto_enable: false,
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 100,
				reset: { interval: ResetInterval.Month },
			},
		],
		free_trial: {
			duration_type: FreeTrialDuration.Day,
			duration_length: 7,
			card_required: false,
		},
	};

	const restUpdates = {
		name: "Temp RPC Changed",
		group: changedGroup,
		add_on: true,
		auto_enable: true,
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 250,
				reset: { interval: ResetInterval.Month },
			},
		],
		free_trial: {
			duration_type: FreeTrialDuration.Day,
			duration_length: 14,
			card_required: true,
		},
	};

	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	await autumnV2_1.products.create({
		id: productId,
		...baseline,
	});
});
