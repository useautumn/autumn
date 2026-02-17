import { expect, test } from "bun:test";
import { ApiVersion, FreeTrialDuration, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

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

	const initialFull = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});

	expect(initialFull.name).toBe(baseline.name);
	expect(initialFull.description).toBe(baseline.description);
	expect(initialFull.group).toBe(baseline.group);
	expect(initialFull.is_add_on).toBe(baseline.add_on);
	expect(initialFull.is_default).toBe(baseline.auto_enable);
	expect(
		initialFull.entitlements.find((ent) => ent.feature_id === TestFeature.Messages)
			?.allowance,
	).toBe(100);

	await autumnV2_1.products.update(productId, restUpdates);

	const afterRestUpdate = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});

	expect(afterRestUpdate.name).toBe(restUpdates.name);
	expect(afterRestUpdate.group).toBe(restUpdates.group);
	expect(afterRestUpdate.is_add_on).toBe(restUpdates.add_on);
	expect(
		afterRestUpdate.entitlements.find(
			(ent) => ent.feature_id === TestFeature.Messages,
		)?.allowance,
	).toBe(250);

	const rpcResponse = await autumnV2_1.post("/plans.update", {
		plan_id: productId,
		...baseline,
	});

	expect(rpcResponse.id).toBe(productId);
	expect(rpcResponse.name).toBe(baseline.name);
	expect(rpcResponse.description).toBe(baseline.description);
	expect(rpcResponse.group).toBe(baseline.group);
	expect(rpcResponse.add_on).toBe(baseline.add_on);
	expect(rpcResponse.auto_enable).toBe(baseline.auto_enable);

	const finalFull = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});

	expect(finalFull.version).toBe(initialFull.version);
	expect(finalFull.name).toBe(baseline.name);
	expect(finalFull.description).toBe(baseline.description);
	expect(finalFull.group).toBe(baseline.group);
	expect(finalFull.is_add_on).toBe(baseline.add_on);
	expect(finalFull.is_default).toBe(baseline.auto_enable);
	expect(finalFull.free_trial?.duration).toBe(
		baseline.free_trial.duration_type,
	);
	expect(finalFull.free_trial?.length).toBe(
		baseline.free_trial.duration_length,
	);
	expect(finalFull.free_trial?.card_required).toBe(
		baseline.free_trial.card_required,
	);
	expect(
		finalFull.entitlements.find((ent) => ent.feature_id === TestFeature.Messages)
			?.allowance,
	).toBe(100);

	const finalApi = await autumnV2_1.products.get(productId);
	expect(finalApi.name).toBe(baseline.name);
	expect(finalApi.description).toBe(baseline.description);
	expect(finalApi.group).toBe(baseline.group);
	expect(finalApi.add_on).toBe(baseline.add_on);
	expect(finalApi.auto_enable).toBe(baseline.auto_enable);
});
