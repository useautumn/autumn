/**
 * TDD test for plan variants — reset-tier ladder.
 *
 * Contract under test:
 *   New endpoints:
 *     - POST /plans.create_variant -> ApiPlanV1
 *     - POST /plans.preview_update -> PreviewUpdatePlanResponseV2
 *   New behaviors:
 *     - create_variant copies BOTH same-feature_id items (day + month not collapsed)
 *     - preview_update diff disambiguates by reset.interval (day vs month)
 *     - propagate_to_variants applies base→base diff to each variant
 *     - credit-pack tier ladder: 4 priced variants, Dashboard propagation
 *     - 21 variants → too_many_variants (400), 20 succeeds
 *     - day-reset survives versioning of both base and variant
 *     - hour-reset propagates with filter interval: "hour"
 *     - Stripe price_id retained on variant version-up
 *     - create_variant rejects archived base (400) and id collision (409)
 *     - preview_update rejects variant id (400)
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	type PreviewUpdatePlanResponseV2,
	ProductItemInterval,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });
const { db, org, env } = ctx;
const getSuffix = () => Math.random().toString(36).slice(2, 9);

const cleanup = async (...ids: string[]) => {
	for (const id of ids) {
		try { await autumnRpc.plans.delete(id, { allVersions: true }); } catch {}
	}
};

const createVariantRpc = async <T = ApiPlanV1>(planId: string, variantId: string, name: string) =>
	autumnRpc.rpc.call<T>({ method: "/plans.create_variant", body: { base_plan_id: planId, variant_plan_id: variantId, name } });

const previewUpdateRpc = async <T = PreviewUpdatePlanResponseV2>(planId: string, updates: Record<string, unknown>) =>
	autumnRpc.rpc.call<T>({ method: "/plans.preview_update", body: { plan_id: planId, ...updates } });

const getPlanRpc = async (planId: string) =>
	autumnRpc.plans.get<ApiPlanV1>(planId);

const creditsItem = (included: number, interval: ResetInterval) => ({
	feature_id: TestFeature.Credits,
	included,
	reset: { interval },
});

const prepaidCreditsItem = (amount: number) => ({
	feature_id: TestFeature.Credits,
	included: 0,
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
	},
});

const dashboardItem = { feature_id: TestFeature.Dashboard };

const createBaseWithItems = async (id: string, itemDefs: Record<string, unknown>[]) => {
	await cleanup(id);
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: id,
		name: `Base ${id}`,
		group: `grp_${id}`,
		auto_enable: false,
		items: itemDefs as any,
	});
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. create_variant copies BOTH same-feature_id items — day + month preserved
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("reset-tier: create_variant copies BOTH same-feature_id day+month items")}`, async () => {
	const baseId = `rt_copy_${getSuffix()}`;
	const variantId = `rt_copy_v_${getSuffix()}`;
	await createBaseWithItems(baseId, [
		creditsItem(100, ResetInterval.Month),
		creditsItem(50, ResetInterval.Day),
	]);

	await createVariantRpc(baseId, variantId, "Variant Copy");

	const variant = await getPlanRpc(variantId);
	const creditsItems = variant.items.filter((i) => i.feature_id === TestFeature.Credits);
	expect(creditsItems.length).toBe(2);

	const monthItem = creditsItems.find((i) => i.reset?.interval === ResetInterval.Month);
	const dayItem = creditsItems.find((i) => i.reset?.interval === ResetInterval.Day);
	expect(monthItem).toBeDefined();
	expect(monthItem!.included).toBe(100);
	expect(dayItem).toBeDefined();
	expect(dayItem!.included).toBe(50);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. preview_update mutates only day-reset item — diff has ONE remove, ONE add
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("reset-tier: preview_update diff targets only day-reset item, month sibling untouched")}`, async () => {
	const baseId = `rt_diff_${getSuffix()}`;
	await createBaseWithItems(baseId, [
		creditsItem(100, ResetInterval.Month),
		creditsItem(50, ResetInterval.Day),
	]);

	const preview = await previewUpdateRpc(baseId, {
		items: [
			creditsItem(100, ResetInterval.Month),
			creditsItem(200, ResetInterval.Day),
		],
	});

	expect(preview.diff.remove_items).toBeDefined();
	expect(preview.diff.remove_items!.length).toBe(1);
	expect(preview.diff.remove_items![0].feature_id).toBe(TestFeature.Credits);
	expect(preview.diff.remove_items![0].interval).toBe(ResetInterval.Day);

	expect(preview.diff.add_items).toBeDefined();
	expect(preview.diff.add_items!.length).toBe(1);
	expect(preview.diff.add_items![0].feature_id).toBe(TestFeature.Credits);

	const hasMonthInRemove = preview.diff.remove_items?.some(
		(r) => r.interval === ResetInterval.Month,
	);
	expect(hasMonthInRemove).toBeFalsy();
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. propagate day-only change — variant month byte-identical, day reflects new
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("reset-tier: propagate day-only change, month sibling byte-identical")}`, async () => {
	const baseId = `rt_prop_${getSuffix()}`;
	const variantId = `rt_prop_v_${getSuffix()}`;
	await createBaseWithItems(baseId, [
		creditsItem(100, ResetInterval.Month),
		creditsItem(50, ResetInterval.Day),
	]);
	await createVariantRpc(baseId, variantId, "Variant Prop");

	const variantBefore = await getPlanRpc(variantId);
	const monthBefore = variantBefore.items.find(
		(i) => i.feature_id === TestFeature.Credits && i.reset?.interval === ResetInterval.Month,
	);

	await autumnRpc.plans.update<ApiPlanV1>(baseId, {
		items: [
			creditsItem(100, ResetInterval.Month),
			creditsItem(300, ResetInterval.Day),
		],
		propagate_to_variants: [variantId],
	});

	const variantAfter = await getPlanRpc(variantId);
	const monthAfter = variantAfter.items.find(
		(i) => i.feature_id === TestFeature.Credits && i.reset?.interval === ResetInterval.Month,
	);
	const dayAfter = variantAfter.items.find(
		(i) => i.feature_id === TestFeature.Credits && i.reset?.interval === ResetInterval.Day,
	);

	expect(monthAfter).toEqual(monthBefore);
	expect(dayAfter!.included).toBe(300);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. credit-pack tier ladder — 4 priced variants, Dashboard propagated to all
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("reset-tier: tier ladder — 4 priced variants retain own price, Dashboard added")}`, async () => {
	const baseId = `rt_ladder_${getSuffix()}`;
	await createBaseWithItems(baseId, [prepaidCreditsItem(10)]);

	const variantIds: string[] = [];
	const prices = [10, 20, 30, 40];
	for (let i = 0; i < 4; i++) {
		const vid = `${baseId}_v${i + 1}_${getSuffix()}`;
		await createVariantRpc(baseId, vid, `Tier ${i + 1}`);
		await autumnRpc.plans.update<ApiPlanV1>(vid, {
			items: [prepaidCreditsItem(prices[i])],
		});
		variantIds.push(vid);
	}

	await autumnRpc.plans.update<ApiPlanV1>(baseId, {
		items: [prepaidCreditsItem(10), dashboardItem],
		propagate_to_variants: variantIds,
	});

	for (let i = 0; i < 4; i++) {
		const variant = await getPlanRpc(variantIds[i]);
		const credits = variant.items.find((it) => it.feature_id === TestFeature.Credits);
		const dashboard = variant.items.find((it) => it.feature_id === TestFeature.Dashboard);

		expect(dashboard).toBeDefined();
		expect(credits?.price?.amount).toBe(prices[i]);
	}

	await cleanup(baseId, ...variantIds);
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. 21 variants → too_many_variants (400)
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("reset-tier: 21 variants in propagate → too_many_variants")}`, async () => {
	const baseId = `rt_21_${getSuffix()}`;
	await createBaseWithItems(baseId, [creditsItem(100, ResetInterval.Month)]);

	const variantIds: string[] = [];
	for (let i = 0; i < 21; i++) {
		const vid = `${baseId}_v${i}_${getSuffix()}`;
		await createVariantRpc(baseId, vid, `V${i}`);
		variantIds.push(vid);
	}

	await expectAutumnError({
		errCode: "too_many_variants",
		func: async () => {
			await autumnRpc.plans.update<ApiPlanV1>(baseId, {
				items: [creditsItem(200, ResetInterval.Month)],
				propagate_to_variants: variantIds,
			});
		},
	});

	await cleanup(baseId, ...variantIds);
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. 20 variants succeeds — boundary case
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("reset-tier: 20 variants in propagate succeeds (boundary)")}`, async () => {
	const baseId = `rt_20_${getSuffix()}`;
	await createBaseWithItems(baseId, [creditsItem(100, ResetInterval.Month)]);

	const variantIds: string[] = [];
	for (let i = 0; i < 20; i++) {
		const vid = `${baseId}_v${i}_${getSuffix()}`;
		await createVariantRpc(baseId, vid, `V${i}`);
		variantIds.push(vid);
	}

	await autumnRpc.plans.update<ApiPlanV1>(baseId, {
		items: [creditsItem(200, ResetInterval.Month)],
		propagate_to_variants: variantIds,
	});

	for (const vid of variantIds) {
		const variant = await getPlanRpc(vid);
		const credits = variant.items.find((it) => it.feature_id === TestFeature.Credits);
		expect(credits?.included).toBe(200);
	}

	await cleanup(baseId, ...variantIds);
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. day-reset survives versioning of both base and variant
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("reset-tier: day-reset survives versioning of both base and variant")}`, async () => {
	const customerId = `rt_ver_${getSuffix()}`;
	const baseProd = products.base({
		id: "base",
		items: [
			items.monthlyCredits({ includedUsage: 100 }),
			{
				feature_id: TestFeature.Credits,
				included_usage: 50,
				interval: ProductItemInterval.Day,
				interval_count: 1,
			} as any,
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [baseProd] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	const prefixedBaseId = `base_${customerId}`;
	const variantId = `${prefixedBaseId}_v_${getSuffix()}`;
	await createVariantRpc(prefixedBaseId, variantId, "Variant Versioned");

	const cust2 = `rt_ver_c2_${getSuffix()}`;
	await autumnV1_2.createCustomer({ id: cust2, email: `${cust2}@test.com`, name: "C2" });
	await autumnV1_2.attach({ customer_id: cust2, product_id: variantId } as any);

	await autumnRpc.plans.update<ApiPlanV1>(prefixedBaseId, {
		items: [
			creditsItem(100, ResetInterval.Month),
			creditsItem(300, ResetInterval.Day),
		],
		propagate_to_variants: [variantId],
	});

	const baseAfter = await ProductService.getFull({ db, idOrInternalId: prefixedBaseId, orgId: org.id, env });
	const variantAfter = await ProductService.getFull({ db, idOrInternalId: variantId, orgId: org.id, env });

	expect(baseAfter.version).toBe(2);
	expect(variantAfter.version).toBe(2);

	const basePlan = await getPlanRpc(prefixedBaseId);
	const variantPlan = await getPlanRpc(variantId);

	for (const plan of [basePlan, variantPlan]) {
		const creditsItems = plan.items.filter((i) => i.feature_id === TestFeature.Credits);
		expect(creditsItems.length).toBe(2);
		const dayItem = creditsItems.find((i) => i.reset?.interval === ResetInterval.Day);
		const monthItem = creditsItems.find((i) => i.reset?.interval === ResetInterval.Month);
		expect(dayItem).toBeDefined();
		expect(dayItem!.included).toBe(300);
		expect(monthItem).toBeDefined();
		expect(monthItem!.included).toBe(100);
	}

	await cleanup(prefixedBaseId, variantId);
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. hour-reset propagates — filter uses interval: "hour"
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("reset-tier: hour-reset propagates to variant")}`, async () => {
	const baseId = `rt_hour_${getSuffix()}`;
	const variantId = `rt_hour_v_${getSuffix()}`;
	await createBaseWithItems(baseId, [
		creditsItem(50, ResetInterval.Hour),
	]);

	const preview = await previewUpdateRpc(baseId, {
		items: [creditsItem(200, ResetInterval.Hour)],
	});

	expect(preview.diff.remove_items).toBeDefined();
	expect(preview.diff.remove_items![0].interval).toBe(ResetInterval.Hour);

	await createVariantRpc(baseId, variantId, "Variant Hour");

	await autumnRpc.plans.update<ApiPlanV1>(baseId, {
		items: [creditsItem(200, ResetInterval.Hour)],
		propagate_to_variants: [variantId],
	});

	const variant = await getPlanRpc(variantId);
	const hourItem = variant.items.find(
		(i) => i.feature_id === TestFeature.Credits && i.reset?.interval === ResetInterval.Hour,
	);
	expect(hourItem).toBeDefined();
	expect(hourItem!.included).toBe(200);

	await cleanup(baseId, variantId);
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Stripe price reuse on tier-ladder version-up — variant v2 retains stripe_price_id
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("reset-tier: Stripe price_id retained on variant version-up")}`, async () => {
	const baseId = `rt_stripe_${getSuffix()}`;
	const variantId = `rt_stripe_v_${getSuffix()}`;
	await createBaseWithItems(baseId, [prepaidCreditsItem(10)]);
	await createVariantRpc(baseId, variantId, "Variant Stripe");

	const v1 = await ProductService.getFull({ db, idOrInternalId: variantId, orgId: org.id, env });
	const v1Price = v1.prices.find(
		(p: any) => p.config?.feature_id === TestFeature.Credits && p.config?.stripe_price_id,
	);
	expect(v1Price).toBeDefined();
	const v1StripeId = (v1Price as any)?.config?.stripe_price_id;
	expect(v1StripeId).toBeTruthy();

	await autumnRpc.plans.update<ApiPlanV1>(baseId, {
		items: [prepaidCreditsItem(10), dashboardItem],
		propagate_to_variants: [variantId],
		force_version: true,
	} as any);

	const v2 = await ProductService.getFull({ db, idOrInternalId: variantId, orgId: org.id, env });
	expect(v2.version).toBe(2);

	const v2Price = v2.prices.find(
		(p: any) => p.config?.feature_id === TestFeature.Credits && p.config?.stripe_price_id,
	);
	expect(v2Price).toBeDefined();
	expect((v2Price as any)?.config?.stripe_price_id).toBe(v1StripeId);

	await cleanup(baseId, variantId);
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. create_variant rejects archived source — 400 cannot_fork_archived_base
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("reset-tier: create_variant rejects archived base → cannot_fork_archived_base")}`, async () => {
	const baseId = `rt_arch_${getSuffix()}`;
	const variantId = `rt_arch_v_${getSuffix()}`;
	await createBaseWithItems(baseId, [creditsItem(100, ResetInterval.Month)]);

	await autumnRpc.plans.update<ApiPlanV1>(baseId, { archived: true });

	await expectAutumnError({
		errCode: "cannot_fork_archived_base",
		func: async () => {
			await createVariantRpc(baseId, variantId, "Variant Archived");
		},
	});

	await cleanup(baseId);
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. create_variant rejects id collision — 409 product_id_already_exists
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("reset-tier: create_variant rejects id collision → product_id_already_exists")}`, async () => {
	const baseId = `rt_coll_${getSuffix()}`;
	await createBaseWithItems(baseId, [creditsItem(100, ResetInterval.Month)]);

	await expectAutumnError({
		errCode: "product_id_already_exists",
		func: async () => {
			await createVariantRpc(baseId, baseId, "Self Collision");
		},
	});

	await cleanup(baseId);
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. preview_update rejects variant id — 400 cannot_preview_on_variant
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("reset-tier: preview_update rejects variant id → cannot_preview_on_variant")}`, async () => {
	const baseId = `rt_pv_${getSuffix()}`;
	const variantId = `rt_pv_v_${getSuffix()}`;
	await createBaseWithItems(baseId, [creditsItem(100, ResetInterval.Month)]);
	await createVariantRpc(baseId, variantId, "Variant Preview");

	await expectAutumnError({
		errCode: "cannot_preview_on_variant",
		func: async () => {
			await previewUpdateRpc(variantId, {
				items: [creditsItem(200, ResetInterval.Month)],
			});
		},
	});

	await cleanup(baseId, variantId);
});
