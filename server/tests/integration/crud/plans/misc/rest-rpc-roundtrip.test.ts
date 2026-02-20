import { expect, test } from "bun:test";
import {
	ApiVersion,
	type CreatePlanParamsV2Input,
	FreeTrialDuration,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });

const { db, org, env } = ctx;
const getSuffix = () => Math.random().toString(36).slice(2, 9);

type UpdatePlanRpcInput = Omit<UpdatePlanParamsV2Input, "plan_id">;

test.concurrent(`${chalk.yellowBright("rpc regression: rest update then rpc inverse keeps product stable")}`, async () => {
	const productId = `rpc_roundtrip_${getSuffix()}`;
	const baselineGroup = `rpc_regression_baseline_${productId}`;
	const changedGroup = `rpc_regression_changed_${productId}`;

	const baseline = {
		name: "RPC Regression Baseline",
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
		name: "RPC Regression Changed",
		group: changedGroup,
		add_on: true,
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
		await autumnRpc.plans.delete(productId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<unknown, CreatePlanParamsV2Input>({
		plan_id: productId,
		...baseline,
	});

	await autumnV2.products.update(productId, restUpdates);
	await autumnRpc.plans.update<unknown, UpdatePlanRpcInput>(
		productId,
		baseline,
	);

	const finalFull = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});

	expect(finalFull.name).toBe(baseline.name);
	expect(finalFull.group).toBe(baseline.group);
	expect(finalFull.is_add_on).toBe(baseline.add_on);
	expect(
		finalFull.entitlements.find(
			(ent) => ent.feature_id === TestFeature.Messages,
		)?.allowance,
	).toBe(100);
});
