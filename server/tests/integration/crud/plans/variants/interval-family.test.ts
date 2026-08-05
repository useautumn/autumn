/**
 * Plan variants — interval family, slice 1.
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
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
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
import { expectPreviewVariantsCorrect } from "./utils/expectVariantPreviewCorrect.js";
import {
	expectStripeResourcesCarriedToVariant,
	expectVariantProductCorrect,
} from "./utils/expectVariantProductCorrect.js";
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

const baseProduct = (id: string) =>
	products.pro({ id, items: [items.monthlyMessages({ includedUsage: 100 })] });

const monthlyItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

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

const getMsgAllowance = (full: any) =>
	full.entitlements.find((e: any) => e.feature_id === TestFeature.Messages)
		?.allowance;

// ═════════════════════════════════════════════════════════════════
// 1. Create 5 variants — base_internal_product_id, version=1, shared stripe_product_id
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("interval-family create: 5 variants — all get base_internal_product_id, version=1, share stripe_product_id")}`,
	async () => {
		const cid = readableVariantTestId("if_create_family");
		const { ctx, rpc, baseId } = await setupBase(cid, `iv_base_${cid}`);

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
			include_variants: true,
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
// 5. base disable_version cascades: no targeted variant versions,
//    all patch in place regardless of their own customer status
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("interval-family propagate: base disable_version cascades — all 5 variants patch in place, none version")}`,
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

		for (const variantId of variantIds) {
			const v = await getFull(ctx, variantId);
			expect(v.version).toBe(1);
			expect(getMsgAllowance(v)).toBe(200);
		}

		const baseAfter = await getFull(ctx, baseId);
		expect(baseAfter.version).toBe(1);
	},
);

// ═════════════════════════════════════════════════════════════════
// 6. customer on base — base v2, customer-less variants patch in place
//    onto base v2 without versioning themselves
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("interval-family propagate: customer on base — base v2, customer-less variants patch in place onto base v2")}`,
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
			expectVariantProductCorrect({ base: baseV2, variant: v, version: 1 });
			expect(getMsgAllowance(v)).toBe(200);
		}
	},
);
