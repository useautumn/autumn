import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiPlanV1Schema,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	TierBehavior,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

test.concurrent(
	`${chalk.yellowBright("rpc multi-currency: base price additional_currencies round-trips through create + get")}`,
	async () => {
		const productId = `rpc_mc_base_${getSuffix()}`;
		try {
			await autumnRpc.plans.delete(productId, { allVersions: true });
		} catch (_error) {}

		const created = await autumnRpc.plans.create<
			ApiPlanV1,
			CreatePlanParamsV2Input
		>({
			plan_id: productId,
			name: "MC Base Plan",
			auto_enable: false,
			price: {
				amount: 10,
				interval: BillingInterval.Month,
				additional_currencies: [{ currency: "eur", amount: 9 }],
			},
		});

		ApiPlanV1Schema.parse(created);
		expect(created.price?.additional_currencies).toEqual([
			{ currency: "eur", amount: 9 },
		]);

		// Read back from storage.
		const fetched = await autumnRpc.plans.get<ApiPlanV1>(productId);
		expect(fetched.price?.additional_currencies).toEqual([
			{ currency: "eur", amount: 9 },
		]);

		await autumnRpc.plans.delete(productId, { allVersions: true });
	},
);

test.concurrent(
	`${chalk.yellowBright("rpc multi-currency: tiered feature price per-currency amounts round-trip")}`,
	async () => {
		const productId = `rpc_mc_tier_${getSuffix()}`;
		try {
			await autumnRpc.plans.delete(productId, { allVersions: true });
		} catch (_error) {}

		const created = await autumnRpc.plans.create<
			ApiPlanV1,
			CreatePlanParamsV2Input
		>({
			plan_id: productId,
			name: "MC Tiered Plan",
			auto_enable: false,
			items: [
				{
					feature_id: TestFeature.Words,
					included: 100,
					price: {
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
						tier_behavior: TierBehavior.Graduated,
						tiers: [
							{
								to: 1000,
								amount: 0.5,
								additional_currencies: [{ currency: "eur", amount: 0.4 }],
							},
							{
								to: "inf",
								amount: 0.3,
								additional_currencies: [{ currency: "eur", amount: 0.25 }],
							},
						],
					},
				},
			],
		});

		const createdTiers = created.items[0]?.price?.tiers;
		expect(createdTiers?.[0]?.additional_currencies).toEqual([
			{ currency: "eur", amount: 0.4 },
		]);
		expect(createdTiers?.[1]?.additional_currencies).toEqual([
			{ currency: "eur", amount: 0.25 },
		]);

		// Read back from storage.
		const fetched = await autumnRpc.plans.get<ApiPlanV1>(productId);
		const fetchedTiers = fetched.items[0]?.price?.tiers;
		expect(fetchedTiers?.[0]?.additional_currencies).toEqual([
			{ currency: "eur", amount: 0.4 },
		]);
		expect(fetchedTiers?.[1]?.additional_currencies).toEqual([
			{ currency: "eur", amount: 0.25 },
		]);

		await autumnRpc.plans.delete(productId, { allVersions: true });
	},
);
