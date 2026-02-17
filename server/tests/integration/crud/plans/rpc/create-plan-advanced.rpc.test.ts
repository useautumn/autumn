import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	type ApiProduct,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsInput,
	ProductItemInterval,
	ResetInterval,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });

const getSuffix = () => Math.random().toString(36).slice(2, 9);

test.concurrent(`${chalk.yellowBright("rpc create: metered feature with monthly reset")}`, async () => {
	const productId = `rpc_metered_${getSuffix()}`;
	const group = `rpc_group_${productId}`;
	try {
		await autumnRpc.plans.delete(productId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "RPC Metered Monthly",
		group,
		auto_enable: false,
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 1200,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	const messagesItem = v1_2.items.find(
		(item) => item.feature_id === TestFeature.Messages,
	);
	expect(messagesItem?.included_usage).toBe(1200);
	expect(messagesItem?.interval).toBe(ProductItemInterval.Month);
});

test.concurrent(`${chalk.yellowBright("rpc create: tiered usage pricing")}`, async () => {
	const productId = `rpc_tiered_${getSuffix()}`;
	const group = `rpc_group_${productId}`;
	try {
		await autumnRpc.plans.delete(productId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "RPC Tiered Pricing",
		group,
		auto_enable: false,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [
						{ to: 100, amount: 0.1 },
						{ to: 500, amount: 0.08 },
						{ to: TierInfinite, amount: 0.05 },
					],
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
					billing_units: 1,
				},
			},
		],
	});

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	const messagesItem = v1_2.items.find(
		(item) => item.feature_id === TestFeature.Messages,
	);
	expect(messagesItem?.tiers).toHaveLength(3);
	expect(messagesItem?.usage_model).toBe(UsageModel.PayPerUse);
});

test.concurrent(`${chalk.yellowBright("rpc create: validation rejects reset/price interval mismatch")}`, async () => {
	const productId = `rpc_invalid_${getSuffix()}`;
	const group = `rpc_group_${productId}`;
	try {
		await autumnRpc.plans.delete(productId, { allVersions: true });
	} catch (_error) {}

	let err: { code?: string } | null = null;
	try {
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsInput>({
			id: productId,
			name: "RPC Invalid Intervals",
			group,
			auto_enable: false,
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: ResetInterval.Minute },
					price: {
						amount: 10,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
						billing_units: 1,
					},
				},
			],
		});
	} catch (error: unknown) {
		if (error && typeof error === "object" && "code" in error) {
			err = error as { code?: string };
		}
	}

	expect(err).toBeDefined();
	if (err === null) {
		throw new Error("Expected request to fail with invalid_inputs");
	}
	expect(err.code).toBe("invalid_inputs");
});
