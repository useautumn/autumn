/**
 * Plan variants — feature-drop propagation, slice 1.
 *
 * Base has 7 items (6 feature items + 1 base price). Variants drop 1-2 items.
 * Tests OOTO-IWTN ("out with old, in with new") propagation semantics.
 *
 * Contract under test (from tests/_temp/variants/CONTRACT.md):
 *   - create_variant copies all base items
 *   - variant can be updated to strip items
 *   - preview_update shows item changes + affected variants (read-only)
 *   - propagate feature-add preserves strip
 *   - propagate item modification re-adds stripped item (OOTO-IWTN, contract #16)
 *   - opt-out (propagate=[]) preserves strip; opt-in re-adds
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type PlanUpdatePreview,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	expectPreviewItemChangeCorrect,
	expectPreviewVariantsCorrect,
} from "./utils/expectVariantPreviewCorrect.js";
import { expectVariantProductCorrect } from "./utils/expectVariantProductCorrect.js";
import { readableVariantTestId } from "./utils/readableVariantTestId.js";
import { createVariantPlan } from "./utils/variantTestPlanUtils.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;

const getFull = (
	ctx: { db: any; org: { id: string }; env: any },
	planId: string,
	version?: number,
) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

// ── V1 item helpers ──────────────────────────────────────────────

const v1 = {
	msgFree: (included = 100) => ({
		feature_id: TestFeature.Messages,
		included,
		reset: { interval: ResetInterval.Month },
	}),
	msgPrepaid: () => ({
		feature_id: TestFeature.Messages,
		included: 0,
		price: {
			amount: 10,
			interval: BillingInterval.Month,
			billing_method: BillingMethod.Prepaid,
			billing_units: 100,
		},
	}),
	usersFree: (included = 5) => ({
		feature_id: TestFeature.Users,
		included,
		reset: { interval: ResetInterval.Month },
	}),
	usersAllocated: () => ({
		feature_id: TestFeature.Users,
		included: 0,
		price: {
			amount: 10,
			interval: BillingInterval.Month,
			billing_method: BillingMethod.UsageBased,
		},
	}),
	credits: (included = 100) => ({
		feature_id: TestFeature.Credits,
		included,
		reset: { interval: ResetInterval.Month },
	}),
	dashboard: () => ({ feature_id: TestFeature.Dashboard }),
	adminRights: () => ({ feature_id: TestFeature.AdminRights }),
};

const allItems = () => [
	v1.msgFree(),
	v1.msgPrepaid(),
	v1.usersFree(),
	v1.usersAllocated(),
	v1.credits(),
	v1.dashboard(),
];

const itemsNoDashboard = () => [
	v1.msgFree(),
	v1.msgPrepaid(),
	v1.usersFree(),
	v1.usersAllocated(),
	v1.credits(),
];

const itemsNoUsersFree = () => [
	v1.msgFree(),
	v1.msgPrepaid(),
	v1.usersAllocated(),
	v1.credits(),
	v1.dashboard(),
];

const monthlyPrice = { amount: 20, interval: BillingInterval.Month as const };

// V2 fixture: 6 feature items; products.pro adds base price → 7 total
const baseProduct = (id: string) =>
	products.pro({
		id,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.prepaidMessages({ price: 10 }),
			items.monthlyUsers({ includedUsage: 5 }),
			items.allocatedUsers({ includedUsage: 0 }),
			items.monthlyCredits({ includedUsage: 100 }),
			items.dashboard(),
		],
	});

const setupScenario = async (cid: string, baseId: string) => {
	const base = baseProduct(baseId);
	const { ctx } = await initScenario({
		customerId: cid,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [],
	});
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	return { ctx, rpc, baseId: base.id };
};

const createVariant = async (
	rpc: AutumnRpcCli,
	baseId: string,
	variantId: string,
	name = "Variant",
) =>
	createVariantPlan({
		rpc,
		basePlanId: baseId,
		variantPlanId: variantId,
		name,
	});

// ═════════════════════════════════════════════════════════════════
// 1. create_variant copies all 7 items
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("feature-drop create_variant: copies all 7 items (6 features + base price)")}`,
	async () => {
		const cid = readableVariantTestId("fd_copy");
		const { ctx, rpc, baseId } = await setupScenario(cid, `fd_base_${cid}`);
		const variantId = `fd_var_${cid}`;

		await createVariant(rpc, baseId, variantId);

		const baseFull = await getFull(ctx, baseId);
		const variantFull = await getFull(ctx, variantId);

		expectVariantProductCorrect({ base: baseFull, variant: variantFull });

		expect(variantFull.entitlements.length).toBe(baseFull.entitlements.length);
		expect(variantFull.prices.length).toBe(baseFull.prices.length);

		const variant = await rpc.plans.get<ApiPlanV1>(variantId);
		expect(variant.items.length).toBe(6);
		expect(variant.price).not.toBeNull();
		expect(variant.price?.amount).toBe(20);
	},
);

// ═════════════════════════════════════════════════════════════════
// 2. create variant + manually strip Dashboard → variant has 6, base has 7
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("feature-drop strip: variant drops Dashboard → 6 items, base keeps 7")}`,
	async () => {
		const cid = readableVariantTestId("fd_strip");
		const { ctx, rpc, baseId } = await setupScenario(cid, `fd_base_${cid}`);
		const variantId = `fd_var_${cid}`;

		await createVariant(rpc, baseId, variantId);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, {
			items: itemsNoDashboard(),
			price: monthlyPrice,
			disable_version: true,
		});

		const basePlan = await rpc.plans.get<ApiPlanV1>(baseId);
		const variantPlan = await rpc.plans.get<ApiPlanV1>(variantId);

		expect(basePlan.items.length).toBe(6);
		expect(variantPlan.items.length).toBe(5);

		const baseDash = basePlan.items.find(
			(i) => i.feature_id === TestFeature.Dashboard,
		);
		const variantDash = variantPlan.items.find(
			(i) => i.feature_id === TestFeature.Dashboard,
		);
		expect(baseDash).toBeDefined();
		expect(variantDash).toBeUndefined();
	},
);

// ═════════════════════════════════════════════════════════════════
// 3. preview_update with feature-add against stripped variant
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("feature-drop preview: feature-add item changes list stripped variant")}`,
	async () => {
		const cid = readableVariantTestId("fd_preview_add");
		const { ctx, rpc, baseId } = await setupScenario(cid, `fd_base_${cid}`);
		const variantId = `fd_var_${cid}`;

		await createVariant(rpc, baseId, variantId);
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, {
			items: itemsNoDashboard(),
			price: monthlyPrice,
			disable_version: true,
		});

		const res = (await rpc.post("/plans.preview_update", {
			plan_id: baseId,
			items: [...allItems(), v1.adminRights()],
			price: monthlyPrice,
			include_variants: true,
		})) as PlanUpdatePreview;

		expectPreviewVariantsCorrect({
			preview: res,
			variants: [{ plan_id: variantId }],
		});
		expectPreviewItemChangeCorrect({
			preview: res,
			action: "created",
			featureId: TestFeature.AdminRights,
		});
	},
);

// ═════════════════════════════════════════════════════════════════
// 4. propagate feature-add preserves strip
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("feature-drop propagate: feature-add to base → variant gets new feature, Dashboard still absent")}`,
	async () => {
		const cid = readableVariantTestId("fd_prop_add");
		const { ctx, rpc, baseId } = await setupScenario(cid, `fd_base_${cid}`);
		const variantId = `fd_var_${cid}`;

		await createVariant(rpc, baseId, variantId);
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, {
			items: itemsNoDashboard(),
			price: monthlyPrice,
			disable_version: true,
		});

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [...allItems(), v1.adminRights()],
			price: monthlyPrice,
			disable_version: true,
			update_variant_ids: [variantId],
		});

		const variantPlan = await rpc.plans.get<ApiPlanV1>(variantId);

		const dash = variantPlan.items.find(
			(i) => i.feature_id === TestFeature.Dashboard,
		);
		expect(dash).toBeUndefined();

		const admin = variantPlan.items.find(
			(i) => i.feature_id === TestFeature.AdminRights,
		);
		expect(admin).toBeDefined();

		expect(variantPlan.items.length).toBe(6);
	},
);

// ═════════════════════════════════════════════════════════════════
// 5. propagate item modification re-adds stripped item (OOTO-IWTN)
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("feature-drop OOTO-IWTN: base changes Users 5→10, propagate re-adds stripped Users at 10")}`,
	async () => {
		const cid = readableVariantTestId("fd_readd_stripped");
		const { ctx, rpc, baseId } = await setupScenario(cid, `fd_base_${cid}`);
		const variantId = `fd_var_${cid}`;

		await createVariant(rpc, baseId, variantId);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, {
			items: itemsNoUsersFree(),
			price: monthlyPrice,
			disable_version: true,
		});

		const beforeVariant = await rpc.plans.get<ApiPlanV1>(variantId);
		expect(
			beforeVariant.items.find(
				(i) => i.feature_id === TestFeature.Users && !i.price,
			),
		).toBeUndefined();

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [
				v1.msgFree(),
				v1.msgPrepaid(),
				v1.usersFree(10),
				v1.usersAllocated(),
				v1.credits(),
				v1.dashboard(),
			],
			price: monthlyPrice,
			disable_version: true,
			update_variant_ids: [variantId],
		});

		const variantPlan = await rpc.plans.get<ApiPlanV1>(variantId);
		const usersFree = variantPlan.items.find(
			(i) => i.feature_id === TestFeature.Users && !i.price,
		);
		expect(usersFree).toBeDefined();
		expect(usersFree?.included).toBe(10);
	},
);

// ═════════════════════════════════════════════════════════════════
// 6. opt-out preserves strip vs opt-in re-adds
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("feature-drop opt-out: propagate=[] preserves strip, propagate=[variant] re-adds")}`,
	async () => {
		const cid = readableVariantTestId("fd_opt_in_out");
		const { ctx, rpc, baseId } = await setupScenario(cid, `fd_base_${cid}`);
		const variantId1 = `fd_var1_${cid}`;
		const variantId2 = `fd_var2_${cid}`;

		await createVariant(rpc, baseId, variantId1, "OptOut");
		await createVariant(rpc, baseId, variantId2, "OptIn");

		for (const vid of [variantId1, variantId2]) {
			await rpc.plans.update<ApiPlanV1, RpcUpdate>(vid, {
				items: itemsNoUsersFree(),
				price: monthlyPrice,
				disable_version: true,
			});
		}

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [
				v1.msgFree(),
				v1.msgPrepaid(),
				v1.usersFree(10),
				v1.usersAllocated(),
				v1.credits(),
				v1.dashboard(),
			],
			price: monthlyPrice,
			disable_version: true,
			update_variant_ids: [],
		});

		const optOutPlan = await rpc.plans.get<ApiPlanV1>(variantId1);
		expect(
			optOutPlan.items.find(
				(i) => i.feature_id === TestFeature.Users && !i.price,
			),
		).toBeUndefined();

		// Second update: Users 10→15 to produce a non-empty diff for propagation
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [
				v1.msgFree(),
				v1.msgPrepaid(),
				v1.usersFree(15),
				v1.usersAllocated(),
				v1.credits(),
				v1.dashboard(),
			],
			price: monthlyPrice,
			disable_version: true,
			update_variant_ids: [variantId2],
		});

		const optInPlan = await rpc.plans.get<ApiPlanV1>(variantId2);
		const usersFree = optInPlan.items.find(
			(i) => i.feature_id === TestFeature.Users && !i.price,
		);
		expect(usersFree).toBeDefined();
		expect(usersFree?.included).toBe(15);
	},
);
