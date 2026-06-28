/**
 * Plan variants — interval family.
 *
 * 1 base + 5 sibling variants with different billing intervals
 * (week, quarter, semi_annual, year, one_off). Messages feature
 * with varying reset intervals. Synthetic harness products.
 *
 * Contract under test (from tests/_temp/variants/CONTRACT.md):
 *   - create_variant: copies base items, sets base_internal_product_id, version=1
 *   - preview_update: returns variants, read-only, rejects on variant
 *   - propagate: patches in-place (no customers) or versions (β rule)
 *   - β rule: variant versions iff baseWasVersioned || variantHasCustomers
 *   - multi-version skip: opted-out variant gets only latest diff, not cumulative
 *   - different intervals don't merge in diff/applyDiff
 *   - nested_variant_not_allowed: cannot fork a variant
 *   - Stripe carry-forward: versioned variant retains stripe_price_id
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
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
	expectStripeResourcesCarriedToVariant,
	expectVariantProductCorrect,
} from "./utils/expectVariantProductCorrect.js";
import { expectPreviewVariantsCorrect } from "./utils/expectVariantPreviewCorrect.js";
import { readableVariantTestId } from "./utils/readableVariantTestId.js";
import { createVariantPlan } from "./utils/variantTestPlanUtils.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;

const catchErr = async (fn: () => Promise<unknown>) => {
	try {
		await fn();
		return null;
	} catch (e: unknown) {
		return e as { code?: string; statusCode?: number };
	}
};

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

const baseProduct = (id: string) =>
	products.pro({ id, items: [items.monthlyMessages({ includedUsage: 100 })] });

const monthlyItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const usersItem = (included = 5) => ({
	feature_id: TestFeature.Users,
	included,
	reset: { interval: ResetInterval.Month },
});

const itemWithInterval = (interval: ResetInterval, included = 100) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval },
});

const monthlyPrice = { amount: 20, interval: BillingInterval.Month as const };

const VARIANT_INTERVALS: ResetInterval[] = [
	ResetInterval.Week,
	ResetInterval.Quarter,
	ResetInterval.SemiAnnual,
	ResetInterval.Year,
	ResetInterval.OneOff,
];

const setupBase = async (cid: string, baseId: string) => {
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

const setupBaseWithPM = async (cid: string, baseId: string) => {
	const base = baseProduct(baseId);
	const { autumnV2_2, ctx } = await initScenario({
		customerId: cid,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	return { autumnV2_2, ctx, rpc, baseId: base.id };
};

const setupBaseWithCustomer = async (cid: string, baseId: string) => {
	const base = baseProduct(baseId);
	const { autumnV2_2, ctx } = await initScenario({
		customerId: cid,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [s.billing.attach({ productId: base.id })],
	});
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	return { autumnV2_2, ctx, rpc, baseId: base.id };
};

const createVariant = (
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

const create5Variants = async (
	rpc: AutumnRpcCli,
	baseId: string,
	cid: string,
) => {
	const ids: string[] = [];
	for (let i = 0; i < 5; i++) {
		const vid = `iv_v${i}_${cid}`;
		await createVariant(rpc, baseId, vid, `Variant ${i}`);
		ids.push(vid);
	}
	return ids;
};

const updateVariantInterval = async (
	rpc: AutumnRpcCli,
	variantId: string,
	interval: ResetInterval,
) => {
	await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, {
		items: [itemWithInterval(interval)],
		disable_version: true,
	});
};

const getMsgAllowance = (full: any) =>
	full.entitlements.find(
		(e: any) => e.feature_id === TestFeature.Messages,
	)?.allowance;

const getUsersAllowance = (full: any) =>
	full.entitlements.find(
		(e: any) => e.feature_id === TestFeature.Users,
	)?.allowance;

const getStripeProductId = (full: any) =>
	full.prices.find((p: any) => p.config?.type === "fixed")?.config
		?.stripe_product_id;

const getStripePriceId = (full: any) =>
	full.prices.find((p: any) => p.config?.type === "fixed")?.config
		?.stripe_price_id;

// ═════════════════════════════════════════════════════════════════
// 1. Create 5 variants — base_internal_product_id, version=1, shared stripe_product_id
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("interval-family create: 5 variants — all get base_internal_product_id, version=1, share stripe_product_id")}`,
	async () => {
		const cid = readableVariantTestId("if_create_family");
		const { ctx, rpc, baseId } = await setupBase(
			cid,
			`iv_base_${cid}`,
		);

		const variantIds = await create5Variants(rpc, baseId, cid);
		const baseFull = await getFull(ctx, baseId);

		for (const vid of variantIds) {
			const v = await getFull(ctx, vid);
			expectStripeResourcesCarriedToVariant({
				base: baseFull,
				variant: v,
			});
		}
	},
);

// ═════════════════════════════════════════════════════════════════
// 2. preview_update returns all 5, versionable=false (no customers)
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("interval-family preview: returns all 5 variants, versionable=false")}`,
	async () => {
		const cid = readableVariantTestId("if_preview_family");
		const { ctx, rpc, baseId } = await setupBase(cid, `iv_base_${cid}`);

		const variantIds = await create5Variants(rpc, baseId, cid);

		const res = await rpc.post("/plans.preview_update", {
			plan_id: baseId,
			items: [monthlyItem(200)],
		});

		expectPreviewVariantsCorrect({
			preview: res,
			variants: variantIds.map((planId) => ({
				plan_id: planId,
				versionable: false,
			})),
		});
		expect(res.versionable).toBe(false);
		expect((await getFull(ctx, baseId)).version).toBe(1);
	},
);

// ═════════════════════════════════════════════════════════════════
// 3. propagate to all 5, no customers — all patch in place
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("interval-family propagate: all 5 patch in place when no customers")}`,
	async () => {
		const cid = readableVariantTestId("if_prop_all_no_cus");
		const { ctx, rpc, baseId } = await setupBase(cid, `iv_base_${cid}`);

		const variantIds = await create5Variants(rpc, baseId, cid);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyItem(200)],
			update_variant_ids: variantIds,
		});

		const baseAfter = await getFull(ctx, baseId);
		expect(baseAfter.version).toBe(1);

		for (const vid of variantIds) {
			const v = await getFull(ctx, vid);
			expect(v.version).toBe(1);
			expect(getMsgAllowance(v)).toBe(200);
		}
	},
);

// ═════════════════════════════════════════════════════════════════
// 4. propagate to subset of 2 — selected patched, other 3 untouched
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("interval-family propagate: subset of 2 patched, other 3 untouched")}`,
	async () => {
		const cid = readableVariantTestId("if_prop_subset");
		const { ctx, rpc, baseId } = await setupBase(cid, `iv_base_${cid}`);

		const variantIds = await create5Variants(rpc, baseId, cid);
		const selected = variantIds.slice(0, 2);
		const untouched = variantIds.slice(2);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyItem(200)],
			disable_version: true,
			update_variant_ids: selected,
		});

		for (const vid of selected) {
			const v = await getFull(ctx, vid);
			expect(getMsgAllowance(v)).toBe(200);
		}

		for (const vid of untouched) {
			const v = await getFull(ctx, vid);
			expect(getMsgAllowance(v)).toBe(100);
		}
	},
);

// ═════════════════════════════════════════════════════════════════
// 5. customer on one variant — that one versions, other 4 patch in place
// ═════════════════════════════════════════════════════════════════
	test.concurrent(
	`${chalk.yellowBright("interval-family propagate: customer on one variant — that one versions, other 4 patch in place")}`,
	async () => {
		const cid = readableVariantTestId("if_variant_customer");
		const { autumnV2_2, ctx, rpc, baseId } = await setupBaseWithPM(
			cid,
			`iv_base_${cid}`,
		);

		const variantIds = await create5Variants(rpc, baseId, cid);

		await autumnV2_2.billing.attach({
			customer_id: cid,
			plan_id: variantIds[0],
		});

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyItem(200)],
			disable_version: true,
			update_variant_ids: variantIds,
		});

		const v0 = await getFull(ctx, variantIds[0]);
		expect(v0.version).toBe(2);
		expect(getMsgAllowance(v0)).toBe(200);

		for (let i = 1; i < 5; i++) {
			const v = await getFull(ctx, variantIds[i]);
			expect(v.version).toBe(1);
			expect(getMsgAllowance(v)).toBe(200);
		}

		const baseAfter = await getFull(ctx, baseId);
		expect(baseAfter.version).toBe(1);
	},
);

// ═════════════════════════════════════════════════════════════════
// 6. customer on base — base v2 + all 5 variants v2, pin to new base v2
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("interval-family propagate: customer on base — base v2 + all 5 variants v2, pin to new base v2 internal_id")}`,
	async () => {
		const cid = readableVariantTestId("if_base_customer");
		const { ctx, rpc, baseId } = await setupBaseWithCustomer(
			cid,
			`iv_base_${cid}`,
		);

		const variantIds = await create5Variants(rpc, baseId, cid);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyItem(200)],
			update_variant_ids: variantIds,
		});

		const baseV2 = await getFull(ctx, baseId);
		expect(baseV2.version).toBe(2);

		for (const vid of variantIds) {
			const v = await getFull(ctx, vid);
			expectVariantProductCorrect({ base: baseV2, variant: v, version: 2 });
			expect(getMsgAllowance(v)).toBe(200);
		}
	},
);

// ═════════════════════════════════════════════════════════════════
// 7. multi-version skip — v1→v2 (propagate=[]), then v2→v3 (propagate=[2])
//     Selected variants get v3's diff only, NOT the qty change
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("interval-family multi-version skip: opted-out variant gets only latest diff, not cumulative")}`,
	async () => {
		const cid = readableVariantTestId("if_multi_version_skip");
		const { ctx, rpc, baseId } = await setupBaseWithCustomer(
			cid,
			`iv_base_${cid}`,
		);

		const variantIds = await create5Variants(rpc, baseId, cid);
		const selected = variantIds.slice(0, 2);

		// v1→v2: qty change, no propagation
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyItem(200)],
		});

		const baseV2 = await getFull(ctx, baseId);
		expect(baseV2.version).toBe(2);

		for (const vid of variantIds) {
			const v = await getFull(ctx, vid);
			expect(v.version).toBe(1);
			expect(getMsgAllowance(v)).toBe(100);
		}

		// v2→v3: add Users feature, propagate to 2
		// force_version: customer is on v1, so v2 has no customers — force versioning
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyItem(200), usersItem(5)],
			update_variant_ids: selected,
			force_version: true,
		});

		const baseV3 = await getFull(ctx, baseId);
		expect(baseV3.version).toBe(3);

		// Selected variants: version 2, Messages still 100, Users added at 5
		for (const vid of selected) {
			const v = await getFull(ctx, vid);
			expectVariantProductCorrect({ base: baseV3, variant: v, version: 2 });
			expect(getMsgAllowance(v)).toBe(100);
			expect(getUsersAllowance(v)).toBe(5);
		}

		// Unselected variants: still v1, Messages 100, no Users
		for (const vid of variantIds.slice(2)) {
			const v = await getFull(ctx, vid);
			expect(v.version).toBe(1);
			expect(getMsgAllowance(v)).toBe(100);
			expect(getUsersAllowance(v)).toBeUndefined();
		}
	},
);

// ═════════════════════════════════════════════════════════════════
// 8. different intervals don't merge — diff targets only base items
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("interval-family intervals: different intervals don't merge — diff targets only matching items")}`,
	async () => {
		const cid = readableVariantTestId("if_interval_precision");
		const { ctx, rpc, baseId } = await setupBase(cid, `iv_base_${cid}`);

		const variantIds = await create5Variants(rpc, baseId, cid);

		// Update each variant to have a different Messages interval
		for (let i = 0; i < 5; i++) {
			await updateVariantInterval(rpc, variantIds[i], VARIANT_INTERVALS[i]);
		}

		// Change base's monthly Messages included 100→200, propagate to all
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyItem(200)],
			disable_version: true,
			update_variant_ids: variantIds,
		});

		// Variants with non-monthly intervals should NOT be affected
		for (let i = 0; i < 5; i++) {
			const v = await getFull(ctx, variantIds[i]);
			const msgAllowance = getMsgAllowance(v);
			expect(msgAllowance).toBe(100);
		}
	},
);

// ═════════════════════════════════════════════════════════════════
// 9. preview_update is read-only — no DB writes
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("interval-family preview: read-only — no DB writes, internal_id unchanged")}`,
	async () => {
		const cid = readableVariantTestId("if_preview_readonly");
		const { ctx, rpc, baseId } = await setupBase(cid, `iv_base_${cid}`);

		const variantIds = await create5Variants(rpc, baseId, cid);
		const before = await getFull(ctx, baseId);

		await rpc.post("/plans.preview_update", {
			plan_id: baseId,
			items: [monthlyItem(200)],
		});

		const after = await getFull(ctx, baseId);
		expect(after.internal_id).toBe(before.internal_id);
		expect(after.version).toBe(before.version);
		expect(getMsgAllowance(after)).toBe(100);

		for (const vid of variantIds) {
			const v = await getFull(ctx, vid);
			expect(getMsgAllowance(v)).toBe(100);
		}
	},
);

// ═════════════════════════════════════════════════════════════════
// 10. nested_variant_not_allowed — create_variant on a variant → 400
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("interval-family create_variant: on a variant id → 400 nested_variant_not_allowed")}`,
	async () => {
		const cid = readableVariantTestId("if_nested_err");
		const { ctx, rpc, baseId } = await setupBase(cid, `iv_base_${cid}`);

		const variantIds = await create5Variants(rpc, baseId, cid);

		const err = await catchErr(() =>
			createVariant(
				rpc,
				variantIds[0],
				`iv_nested_${cid}`,
				"Nested",
			),
		);

		expect(err).not.toBeNull();
		expect(err?.code).toBe("nested_variant_not_allowed");
	},
);

// ═════════════════════════════════════════════════════════════════
// 11. Stripe carry-forward — variant v2 retains stripe_price_id from v1
// ═════════════════════════════════════════════════════════════════
	test.concurrent(
	`${chalk.yellowBright("interval-family stripe: carry-forward — variant v2 retains stripe_price_id from v1 for unchanged prices")}`,
	async () => {
		const cid = readableVariantTestId("if_stripe_price");
		const { autumnV2_2, ctx, rpc, baseId } = await setupBaseWithPM(
			cid,
			`iv_base_${cid}`,
		);

		const variantIds = await create5Variants(rpc, baseId, cid);

		await autumnV2_2.billing.attach({
			customer_id: cid,
			plan_id: variantIds[0],
		});

		const v1Full = await getFull(ctx, variantIds[0]);
		const v1StripePriceId = getStripePriceId(v1Full);
		expect(v1StripePriceId).toBeDefined();

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyItem(200)],
			disable_version: true,
			update_variant_ids: [variantIds[0]],
		});

		const v2Full = await getFull(ctx, variantIds[0]);
		expect(v2Full.version).toBe(2);
		expect(getStripePriceId(v2Full)).toBe(v1StripePriceId);
	},
);
