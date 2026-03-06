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

// ─── Base plan version fields ─────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("versioning: base plan has minor_version=0 and no semver")}`,
	async () => {
		const suffix = getSuffix();
		const planId = `ver_base_${suffix}`;
		const group = `ver_group_${suffix}`;

		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		const created = await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "Version Base Plan",
			group,
			auto_enable: false,
			price: { amount: 1900, interval: BillingInterval.Month },
		});

		ApiPlanV1Schema.parse(created);
		expect(created.version).toBe(1);
		expect(created.minor_version).toBe(0);
		expect(created.semver).toBeUndefined();
		expect(created.variant_id).toBeNull();
	},
);

// ─── Variant version fields ───────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("versioning: new variant has minor_version=1 and semver='1.1'")}`,
	async () => {
		const suffix = getSuffix();
		const planId = `ver_var_${suffix}`;
		const group = `ver_group_${suffix}`;

		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "Variant Semver Base",
			group,
			auto_enable: false,
		});

		const variant = await autumnRpc.plans.createVariant<ApiPlanV1>({
			plan_id: planId,
			variant_id: "annual",
			variant_name: "Variant Semver Annual",
		});

		ApiPlanV1Schema.parse(variant);
		expect(variant.variant_id).toBe("annual");
		expect(variant.version).toBe(1);
		expect(variant.minor_version).toBe(1);
		expect(variant.semver).toBe("1.1");
	},
);

test.concurrent(
	`${chalk.yellowBright("versioning: multiple variants each get independent minor_version=1")}`,
	async () => {
		const suffix = getSuffix();
		const planId = `ver_multi_${suffix}`;
		const group = `ver_group_${suffix}`;

		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "Multi Variant Base",
			group,
			auto_enable: false,
		});

		const monthly = await autumnRpc.plans.createVariant<ApiPlanV1>({
			plan_id: planId,
			variant_id: "monthly",
			variant_name: "Multi Variant Monthly",
		});

		const annual = await autumnRpc.plans.createVariant<ApiPlanV1>({
			plan_id: planId,
			variant_id: "annual",
			variant_name: "Multi Variant Annual",
		});

		ApiPlanV1Schema.parse(monthly);
		ApiPlanV1Schema.parse(annual);

		// Both variants start at minor_version 1 independently
		expect(monthly.minor_version).toBe(1);
		expect(monthly.semver).toBe("1.1");
		expect(annual.minor_version).toBe(1);
		expect(annual.semver).toBe("1.1");
	},
);

// ─── plans.get with semver / minor_version params ─────────────────────────────

test.concurrent(
	`${chalk.yellowBright("versioning: plans.get with semver param fetches exact variant")}`,
	async () => {
		const suffix = getSuffix();
		const planId = `ver_get_semver_${suffix}`;
		const group = `ver_group_${suffix}`;

		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "Semver Get Base",
			group,
			auto_enable: false,
		});

		await autumnRpc.plans.createVariant<ApiPlanV1>({
			plan_id: planId,
			variant_id: "annual",
			variant_name: "Semver Get Annual",
		});

		// Fetch via semver string
		const fetched = await autumnRpc.rpc.call<ApiPlanV1>({
			method: "/plans.get",
			body: {
				plan_id: planId,
				variant_id: "annual",
				semver: "1.1",
			},
		});

		ApiPlanV1Schema.parse(fetched);
		expect(fetched.variant_id).toBe("annual");
		expect(fetched.version).toBe(1);
		expect(fetched.minor_version).toBe(1);
		expect(fetched.semver).toBe("1.1");
	},
);

test.concurrent(
	`${chalk.yellowBright("versioning: plans.get with version+minor_version fetches exact variant")}`,
	async () => {
		const suffix = getSuffix();
		const planId = `ver_get_mv_${suffix}`;
		const group = `ver_group_${suffix}`;

		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "MinorVersion Get Base",
			group,
			auto_enable: false,
		});

		await autumnRpc.plans.createVariant<ApiPlanV1>({
			plan_id: planId,
			variant_id: "monthly",
			variant_name: "MinorVersion Get Monthly",
		});

		// Fetch via explicit version + minor_version integers
		const fetched = await autumnRpc.rpc.call<ApiPlanV1>({
			method: "/plans.get",
			body: {
				plan_id: planId,
				variant_id: "monthly",
				version: 1,
				minor_version: 1,
			},
		});

		ApiPlanV1Schema.parse(fetched);
		expect(fetched.variant_id).toBe("monthly");
		expect(fetched.version).toBe(1);
		expect(fetched.minor_version).toBe(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("versioning: plans.get without version/semver returns latest variant")}`,
	async () => {
		const suffix = getSuffix();
		const planId = `ver_get_latest_${suffix}`;
		const group = `ver_group_${suffix}`;

		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "Latest Variant Get Base",
			group,
			auto_enable: false,
		});

		await autumnRpc.plans.createVariant<ApiPlanV1>({
			plan_id: planId,
			variant_id: "annual",
			variant_name: "Latest Variant Get Annual",
		});

		// Fetch without specifying version — should get latest (minor_version=1)
		const fetched = await autumnRpc.plans.get<ApiPlanV1>(planId, {
			variantId: "annual",
		});

		ApiPlanV1Schema.parse(fetched);
		expect(fetched.variant_id).toBe("annual");
		expect(fetched.minor_version).toBe(1);
		expect(fetched.semver).toBe("1.1");
	},
);

// ─── plans.list version fields ────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("versioning: plans.list returns correct version fields for base and variants")}`,
	async () => {
		const suffix = getSuffix();
		const planId = `ver_list_${suffix}`;
		const group = `ver_group_${suffix}`;

		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "List Version Base",
			group,
			auto_enable: false,
		});

		await autumnRpc.plans.createVariant<ApiPlanV1>({
			plan_id: planId,
			variant_id: "monthly",
			variant_name: "List Version Monthly",
		});

		await autumnRpc.plans.createVariant<ApiPlanV1>({
			plan_id: planId,
			variant_id: "annual",
			variant_name: "List Version Annual",
		});

		const { list } = await autumnRpc.rpc.call<{ list: ApiPlanV1[] }>({
			method: "/plans.list",
			body: {},
		});

		// Validate all plans parse correctly
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

		// Base: version=1, minor_version=0, no semver
		expect(basePlan).toBeDefined();
		expect(basePlan?.version).toBe(1);
		expect(basePlan?.minor_version).toBe(0);
		expect(basePlan?.semver).toBeUndefined();

		// Monthly variant: minor_version=1, semver present
		expect(monthlyVariant).toBeDefined();
		expect(monthlyVariant?.version).toBe(1);
		expect(monthlyVariant?.minor_version).toBe(1);
		expect(monthlyVariant?.semver).toBe("1.1");

		// Annual variant: minor_version=1, semver present
		expect(annualVariant).toBeDefined();
		expect(annualVariant?.version).toBe(1);
		expect(annualVariant?.minor_version).toBe(1);
		expect(annualVariant?.semver).toBe("1.1");
	},
);

// ─── Schema compliance ────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("versioning: all plan responses satisfy ApiPlanV1Schema after variant operations")}`,
	async () => {
		const suffix = getSuffix();
		const planId = `ver_schema_${suffix}`;
		const group = `ver_group_${suffix}`;

		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		// Create base
		const base = await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "Schema Compliance Base",
			group,
			auto_enable: false,
			price: { amount: 2900, interval: BillingInterval.Month },
		});
		ApiPlanV1Schema.parse(base);

		// Create two variants
		const v1 = await autumnRpc.plans.createVariant<ApiPlanV1>({
			plan_id: planId,
			variant_id: "v1",
			variant_name: "Schema Variant 1",
		});
		ApiPlanV1Schema.parse(v1);

		const v2 = await autumnRpc.plans.createVariant<ApiPlanV1>({
			plan_id: planId,
			variant_id: "v2",
			variant_name: "Schema Variant 2",
		});
		ApiPlanV1Schema.parse(v2);

		// Fetch base via get
		const fetchedBase = await autumnRpc.plans.get<ApiPlanV1>(planId);
		ApiPlanV1Schema.parse(fetchedBase);

		// Fetch variant via get
		const fetchedVariant = await autumnRpc.plans.get<ApiPlanV1>(planId, {
			variantId: "v1",
		});
		ApiPlanV1Schema.parse(fetchedVariant);

		// All returned fields coherent
		expect(fetchedBase.minor_version).toBe(0);
		expect(fetchedBase.semver).toBeUndefined();
		expect(fetchedVariant.minor_version).toBe(1);
		expect(fetchedVariant.semver).toBeDefined();
	},
);
