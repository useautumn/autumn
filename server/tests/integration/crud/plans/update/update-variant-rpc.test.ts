import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiPlanV1Schema,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { TestFeature } from "@tests/setup/v2Features";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });

const getSuffix = () => Math.random().toString(36).slice(2, 9);

test.concurrent(`${chalk.yellowBright("rpc updateVariant: update variant items with variant_id")}`, async () => {
	const suffix = getSuffix();
	const planId = `rpc_upd_var_${suffix}`;
	const group = `rpc_upd_var_group_${suffix}`;

	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	// Create base plan
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Update Variant Base",
		group,
		auto_enable: false,
	});

	// Create a variant
	await autumnRpc.plans.createVariant<ApiPlanV1>({
		plan_id: planId,
		variant_id: "monthly",
		variant_name: "Update Variant Monthly",
	});

	// Verify variant starts with no items
	const before = await autumnRpc.plans.get<ApiPlanV1>(planId, {
		variantId: "monthly",
	});
	expect(before.items).toHaveLength(0);

	// Update the variant with a CreatePlanItemParamsV1-shaped feature item
	const updated = await autumnRpc.plans.update<ApiPlanV1>(
		planId,
		{
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: BillingInterval.Month },
					price: {
						amount: 0.5,
						interval: BillingInterval.Month,
						billing_units: 100,
						billing_method: BillingMethod.UsageBased,
					},
				},
			],
		},
		{ variantId: "monthly" },
	);

	ApiPlanV1Schema.parse(updated);
	expect(updated.id).toBe(planId);
	expect(updated.variant_id).toBe("monthly");
	expect(updated.items).toHaveLength(1);
	expect(updated.items[0].feature_id).toBe(TestFeature.Messages);
});

test.concurrent(`${chalk.yellowBright("rpc updateVariant: unknown variant_id returns not found")}`, async () => {
	const suffix = getSuffix();
	const planId = `rpc_upd_var_notfound_${suffix}`;
	const group = `rpc_upd_var_group_${suffix}`;

	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Update Variant NotFound Base",
		group,
		auto_enable: false,
	});

	let err: { code?: string } | null = null;
	try {
		await autumnRpc.plans.update<ApiPlanV1>(
			planId,
			{ items: [] },
			{ variantId: "ghost" },
		);
	} catch (error: unknown) {
		if (error && typeof error === "object" && "code" in error) {
			err = error as { code?: string };
		}
	}

	expect(err).toBeDefined();
	if (err === null) throw new Error("Expected request to fail");
	expect(err.code).toBeDefined();
});

test.concurrent(`${chalk.yellowBright("rpc updateVariant: update without variant_id still updates base plan")}`, async () => {
	const suffix = getSuffix();
	const planId = `rpc_upd_base_${suffix}`;
	const group = `rpc_upd_base_group_${suffix}`;

	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Base Plan Original Name",
		group,
		auto_enable: false,
	});

	const updated = await autumnRpc.plans.update<ApiPlanV1>(planId, {
		name: "Base Plan Updated Name",
	});

	ApiPlanV1Schema.parse(updated);
	expect(updated.id).toBe(planId);
	expect(updated.variant_id).toBeNull();
	expect(updated.name).toBe("Base Plan Updated Name");
});
