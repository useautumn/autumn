import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	type CreatePlanParamsV2Input,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN CONFIG — ignore_past_due
//
// Mirrors the old customer-config.test.ts, but the feature now lives on plans
// (products.config.ignore_past_due) rather than on customers.
// ═══════════════════════════════════════════════════════════════════════════════

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });

const { db, org, env } = ctx;
type UpdatePlanRpcInput = Omit<UpdatePlanParamsV2Input, "plan_id">;

const getDbConfig = async (planId: string) => {
	const product = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});
	return product.config;
};

test.concurrent(`${chalk.yellowBright("plan config: defaults to ignore_past_due=false on create")}`, async () => {
	const planId = "plan_config_default";
	const group = `grp_${planId}`;
	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	const created = await autumnRpc.plans.create<
		ApiPlanV1,
		CreatePlanParamsV2Input
	>({
		plan_id: planId,
		name: "Plan Config Default",
		group,
		auto_enable: false,
	});

	expect(created.config).toBeDefined();
	expect(created.config.ignore_past_due).toBe(false);

	const dbConfig = await getDbConfig(planId);
	expect(dbConfig.ignore_past_due).toBe(false);
});

test.concurrent(`${chalk.yellowBright("plan config: create plan with ignore_past_due=true")}`, async () => {
	const planId = "plan_config_create_true";
	const group = `grp_${planId}`;
	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	const created = await autumnRpc.plans.create<
		ApiPlanV1,
		CreatePlanParamsV2Input
	>({
		plan_id: planId,
		name: "Plan Config Create True",
		group,
		auto_enable: false,
		config: { ignore_past_due: true },
	});

	expect(created.config.ignore_past_due).toBe(true);

	const fetched = await autumnRpc.plans.get<ApiPlanV1>(planId);
	expect(fetched.config.ignore_past_due).toBe(true);

	const dbConfig = await getDbConfig(planId);
	expect(dbConfig.ignore_past_due).toBe(true);
});

test.concurrent(`${chalk.yellowBright("plan config: update ignore_past_due from false to true")}`, async () => {
	const planId = "plan_config_update_true";
	const group = `grp_${planId}`;
	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Plan Config Flip On",
		group,
		auto_enable: false,
	});

	const before = await autumnRpc.plans.get<ApiPlanV1>(planId);
	expect(before.config.ignore_past_due).toBe(false);

	await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(planId, {
		config: { ignore_past_due: true },
	});

	const after = await autumnRpc.plans.get<ApiPlanV1>(planId);
	expect(after.config.ignore_past_due).toBe(true);

	const dbConfig = await getDbConfig(planId);
	expect(dbConfig.ignore_past_due).toBe(true);
});

test.concurrent(`${chalk.yellowBright("plan config: update ignore_past_due from true to false")}`, async () => {
	const planId = "plan_config_update_false";
	const group = `grp_${planId}`;
	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Plan Config Flip Off",
		group,
		auto_enable: false,
		config: { ignore_past_due: true },
	});

	const before = await autumnRpc.plans.get<ApiPlanV1>(planId);
	expect(before.config.ignore_past_due).toBe(true);

	await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(planId, {
		config: { ignore_past_due: false },
	});

	const after = await autumnRpc.plans.get<ApiPlanV1>(planId);
	expect(after.config.ignore_past_due).toBe(false);

	const dbConfig = await getDbConfig(planId);
	expect(dbConfig.ignore_past_due).toBe(false);
});

test.concurrent(`${chalk.yellowBright("plan config: partial update leaves other fields untouched")}`, async () => {
	// Regression guard — updating config shouldn't clobber name / add_on / auto_enable.
	const planId = "plan_config_partial";
	const group = `grp_${planId}`;
	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Original Plan Name",
		group,
		add_on: true,
		auto_enable: false,
	});

	await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(planId, {
		config: { ignore_past_due: true },
	});

	const after = await autumnRpc.plans.get<ApiPlanV1>(planId);
	expect(after.name).toBe("Original Plan Name");
	expect(after.add_on).toBe(true);
	expect(after.auto_enable).toBe(false);
	expect(after.config.ignore_past_due).toBe(true);
});

test.concurrent(`${chalk.yellowBright("plan config: omitting config in update does not reset it")}`, async () => {
	const planId = "plan_config_omit";
	const group = `grp_${planId}`;
	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Plan Config Persist",
		group,
		auto_enable: false,
		config: { ignore_past_due: true },
	});

	// Update something unrelated — config should survive.
	await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(planId, {
		name: "Plan Config Persist Renamed",
	});

	const after = await autumnRpc.plans.get<ApiPlanV1>(planId);
	expect(after.name).toBe("Plan Config Persist Renamed");
	expect(after.config.ignore_past_due).toBe(true);

	const dbConfig = await getDbConfig(planId);
	expect(dbConfig.ignore_past_due).toBe(true);
});
