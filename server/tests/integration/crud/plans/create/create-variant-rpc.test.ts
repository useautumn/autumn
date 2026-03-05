import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiPlanV1Schema,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
} from "@autumn/shared";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });

const getSuffix = () => Math.random().toString(36).slice(2, 9);

test.concurrent(`${chalk.yellowBright("rpc createVariant: happy path — empty variant created under parent")}`, async () => {
	const suffix = getSuffix();
	const planId = `rpc_var_base_${suffix}`;
	const group = `rpc_var_group_${suffix}`;

	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	// Create base plan
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Variant Base Plan",
		group,
		auto_enable: false,
		price: { amount: 2900, interval: BillingInterval.Month },
	});

	// Create variant
	const variant = await autumnRpc.plans.createVariant<ApiPlanV1>({
		plan_id: planId,
		variant_id: "monthly",
		variant_name: "Variant Base Plan Monthly",
	});

	ApiPlanV1Schema.parse(variant);
	expect(variant.id).toBe(planId);
	expect(variant.variant_id).toBe("monthly");
	expect(variant.name).toBe("Variant Base Plan Monthly");
	expect(variant.items).toHaveLength(0);
	// Variants start with no base price until items are added
	expect(variant.price).toBeNull();
});

test.concurrent(`${chalk.yellowBright("rpc createVariant: plans.get with variant_id returns the variant")}`, async () => {
	const suffix = getSuffix();
	const planId = `rpc_var_get_${suffix}`;
	const group = `rpc_var_group_${suffix}`;

	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Get Variant Base",
		group,
		auto_enable: false,
	});

	await autumnRpc.plans.createVariant<ApiPlanV1>({
		plan_id: planId,
		variant_id: "annual",
		variant_name: "Get Variant Annual",
	});

	// Fetch base plan (no variant_id)
	const base = await autumnRpc.plans.get<ApiPlanV1>(planId);
	expect(base.id).toBe(planId);
	expect(base.variant_id).toBeNull();

	// Fetch the variant
	const fetched = await autumnRpc.plans.get<ApiPlanV1>(planId, {
		variantId: "annual",
	});
	ApiPlanV1Schema.parse(fetched);
	expect(fetched.id).toBe(planId);
	expect(fetched.variant_id).toBe("annual");
	expect(fetched.name).toBe("Get Variant Annual");
});

test.concurrent(`${chalk.yellowBright("rpc createVariant: plans.list includes variant flat alongside base")}`, async () => {
	const suffix = getSuffix();
	const planId = `rpc_var_list_${suffix}`;
	const group = `rpc_var_group_${suffix}`;

	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "List Variant Base",
		group,
		auto_enable: false,
	});

	await autumnRpc.plans.createVariant<ApiPlanV1>({
		plan_id: planId,
		variant_id: "monthly",
		variant_name: "List Variant Monthly",
	});

	await autumnRpc.plans.createVariant<ApiPlanV1>({
		plan_id: planId,
		variant_id: "annual",
		variant_name: "List Variant Annual",
	});

	const { list } = await autumnRpc.rpc.call<{ list: ApiPlanV1[] }>({
		method: "/plans.list",
		body: {},
	});

	// All plans in the list parse correctly
	for (const plan of list) {
		ApiPlanV1Schema.parse(plan);
	}

	const basePlan = list.find((p) => p.id === planId && p.variant_id === null);
	const monthlyVariant = list.find(
		(p) => p.id === planId && p.variant_id === "monthly",
	);
	const annualVariant = list.find(
		(p) => p.id === planId && p.variant_id === "annual",
	);

	expect(basePlan).toBeDefined();
	expect(monthlyVariant).toBeDefined();
	expect(annualVariant).toBeDefined();

	// All three are flat (not nested)
	expect(basePlan?.name).toBe("List Variant Base");
	expect(monthlyVariant?.name).toBe("List Variant Monthly");
	expect(annualVariant?.name).toBe("List Variant Annual");
});

test.concurrent(`${chalk.yellowBright("rpc createVariant: duplicate variant_id returns conflict error")}`, async () => {
	const suffix = getSuffix();
	const planId = `rpc_var_dup_${suffix}`;
	const group = `rpc_var_group_${suffix}`;

	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Duplicate Variant Base",
		group,
		auto_enable: false,
	});

	await autumnRpc.plans.createVariant<ApiPlanV1>({
		plan_id: planId,
		variant_id: "monthly",
		variant_name: "Duplicate Variant Monthly",
	});

	let err: { code?: string } | null = null;
	try {
		await autumnRpc.plans.createVariant<ApiPlanV1>({
			plan_id: planId,
			variant_id: "monthly",
			variant_name: "Duplicate Variant Monthly Again",
		});
	} catch (error: unknown) {
		if (error && typeof error === "object" && "code" in error) {
			err = error as { code?: string };
		}
	}

	expect(err).toBeDefined();
	if (err === null) throw new Error("Expected request to fail");
	// ProductAlreadyExistsError produces product_already_exists code
	expect(err.code).toBeDefined();
});

test.concurrent(`${chalk.yellowBright("rpc createVariant: unknown plan_id returns not found error")}`, async () => {
	const suffix = getSuffix();

	let err: { code?: string } | null = null;
	try {
		await autumnRpc.plans.createVariant<ApiPlanV1>({
			plan_id: `nonexistent_plan_${suffix}`,
			variant_id: "monthly",
			variant_name: "Ghost Variant",
		});
	} catch (error: unknown) {
		if (error && typeof error === "object" && "code" in error) {
			err = error as { code?: string };
		}
	}

	expect(err).toBeDefined();
	if (err === null) throw new Error("Expected request to fail");
	expect(err.code).toBeDefined();
});
