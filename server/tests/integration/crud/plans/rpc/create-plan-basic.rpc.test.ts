import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiPlanV1Schema,
	type ApiProduct,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });

const getSuffix = () => Math.random().toString(36).slice(2, 9);

test.concurrent(`${chalk.yellowBright("rpc create: minimal plan (id + name only)")}`, async () => {
	const productId = `rpc_min_plan_${getSuffix()}`;
	const group = `rpc_group_${productId}`;
	try {
		await autumnRpc.plans.delete(productId, { allVersions: true });
	} catch (_error) {}

	const created = await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "RPC Minimal Plan",
		group,
		auto_enable: false,
	});

	ApiPlanV1Schema.parse(created);
	expect(created.id).toBe(productId);
	expect(created.items).toHaveLength(0);

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items).toHaveLength(0);
	expect(v1_2.is_add_on).toBe(false);
});

test.concurrent(`${chalk.yellowBright("rpc create: with base price and flags")}`, async () => {
	const productId = `rpc_flags_${getSuffix()}`;
	const group = `rpc_group_${productId}`;
	try {
		await autumnRpc.plans.delete(productId, { allVersions: true });
	} catch (_error) {}

	const created = await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "RPC Flags Plan",
		group,
		add_on: true,
		auto_enable: false,
		price: {
			amount: 4900,
			interval: BillingInterval.Month,
		},
	});

	expect(created.add_on).toBe(true);
	expect(created.auto_enable).toBe(false);
	expect(created.price?.amount).toBe(4900);
	expect(created.price?.interval).toBe(BillingInterval.Month);

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.is_add_on).toBe(true);
	expect(v1_2.is_default).toBe(false);
});

test.concurrent(`${chalk.yellowBright("rpc create: boolean feature")}`, async () => {
	const productId = `rpc_bool_${getSuffix()}`;
	const group = `rpc_group_${productId}`;
	try {
		await autumnRpc.plans.delete(productId, { allVersions: true });
	} catch (_error) {}

	const created = await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "RPC Boolean Plan",
		group,
		auto_enable: false,
		items: [{ feature_id: TestFeature.Dashboard }],
	});

	expect(created.items.length).toBeGreaterThanOrEqual(1);
	const booleanItem = created.items.find(
		(item: any) => item.feature_id === TestFeature.Dashboard,
	);
	expect(booleanItem).toBeDefined();

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items).toHaveLength(1);
	expect(v1_2.items[0].feature_id).toBe(TestFeature.Dashboard);
});
