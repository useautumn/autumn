/**
 * Plan variants — feature-drop propagation.
 *
 * Base has 7 items (6 feature items + 1 base price). Variants drop 1-2 items.
 * Tests OOTO-IWTN ("out with old, in with new") propagation semantics.
 *
 * Contract under test (from tests/_temp/variants/CONTRACT.md):
 *   - create_variant copies all base items
 *   - variant can be updated to strip items
 *   - preview_update shows diff + affected_variants (read-only)
 *   - propagate feature-add preserves strip
 *   - propagate item modification re-adds stripped item (OOTO-IWTN, contract #16)
 *   - opt-out (propagate=[]) preserves strip; opt-in re-adds
 *   - one-off variant preserves interval across propagation
 *   - multi-version skip: variant gets only latest diff, not cumulative
 *   - preview_update is read-only (no writes)
 *   - nested_variant_not_allowed: cannot fork a variant
 *   - variant_cannot_be_default: is_default rejected on variant
 *   - Stripe carry-forward: existing prices retain stripe_price_id across version-ups
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
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
import { expectVariantProductCorrect } from "./utils/expectVariantProductCorrect.js";
import { readableVariantTestId } from "./utils/readableVariantTestId.js";

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
	storage: () => ({
		feature_id: TestFeature.Storage,
		included: 0,
		price: {
			amount: 10,
			interval: BillingInterval.Month,
			billing_method: BillingMethod.Prepaid,
			billing_units: 100,
		},
	}),
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
	rpc.post("/plans.create_variant", {
		base_plan_id: baseId,
		variant_plan_id: variantId,
		name,
	}) as Promise<ApiPlanV1>;

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
	`${chalk.yellowBright("feature-drop preview: feature-add diff shows add_items, affected_variants lists stripped variant")}`,
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
		})) as {
			will_version: boolean;
			current_version: number;
			diff: any;
			affected_variants: Array<{
				id: string;
				name: string;
				latest_version: number;
				would_version: boolean;
			}>;
		};

		expect(res.diff.add_items).toBeDefined();
		expect(res.diff.add_items.length).toBeGreaterThanOrEqual(1);
		const added = res.diff.add_items.find(
			(i: any) => i.feature_id === TestFeature.AdminRights,
		);
		expect(added).toBeDefined();

		expect(res.affected_variants.length).toBe(1);
		expect(res.affected_variants[0].id).toBe(variantId);
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
			propagate_to_variants: [variantId],
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
			propagate_to_variants: [variantId],
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
			propagate_to_variants: [],
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
			propagate_to_variants: [variantId2],
		});

		const optInPlan = await rpc.plans.get<ApiPlanV1>(variantId2);
		const usersFree = optInPlan.items.find(
			(i) => i.feature_id === TestFeature.Users && !i.price,
		);
		expect(usersFree).toBeDefined();
		expect(usersFree?.included).toBe(15);
	},
);

// ═════════════════════════════════════════════════════════════════
// 7. one-off variant preserves interval
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("feature-drop one-off: variant with one_off price preserves interval after propagation")}`,
	async () => {
		const cid = readableVariantTestId("fd_one_off");
		const { ctx, rpc, baseId } = await setupScenario(cid, `fd_base_${cid}`);
		const variantId = `fd_var_${cid}`;

		await createVariant(rpc, baseId, variantId);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, {
			items: allItems(),
			price: { amount: 50, interval: BillingInterval.OneOff },
			disable_version: true,
		});

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [
				v1.msgFree(200),
				v1.msgPrepaid(),
				v1.usersFree(),
				v1.usersAllocated(),
				v1.credits(),
				v1.dashboard(),
			],
			price: monthlyPrice,
			disable_version: true,
			propagate_to_variants: [variantId],
		});

		const variantPlan = await rpc.plans.get<ApiPlanV1>(variantId);
		expect(variantPlan.price?.interval).toBe(BillingInterval.OneOff);
	},
);

// ═════════════════════════════════════════════════════════════════
// 8. multi-version skip
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("feature-drop multi-version skip: variant gets only v2→v3 diff, not v1→v2")}`,
	async () => {
		const cid = readableVariantTestId("fd_multi_version");
		const { ctx, rpc, baseId } = await setupScenario(cid, `fd_base_${cid}`);
		const variantId1 = `fd_var1_${cid}`;
		const variantId2 = `fd_var2_${cid}`;

		await createVariant(rpc, baseId, variantId1, "V1");
		await createVariant(rpc, baseId, variantId2, "V2");

		// v1→v2: add AdminRights, opt out both variants
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [...allItems(), v1.adminRights()],
			price: monthlyPrice,
			force_version: true,
			propagate_to_variants: [],
		});

		// v2→v3: add Storage, propagate to both
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [...allItems(), v1.adminRights(), v1.storage()],
			price: monthlyPrice,
			force_version: true,
			propagate_to_variants: [variantId1, variantId2],
		});

		const v1Plan = await rpc.plans.get<ApiPlanV1>(variantId1);
		const v2Plan = await rpc.plans.get<ApiPlanV1>(variantId2);

		// Both get Storage (v2→v3 diff) but NOT AdminRights (v1→v2 diff)
		const storage1 = v1Plan.items.find(
			(i) => i.feature_id === TestFeature.Storage,
		);
		const storage2 = v2Plan.items.find(
			(i) => i.feature_id === TestFeature.Storage,
		);
		expect(storage1).toBeDefined();
		expect(storage2).toBeDefined();

		const admin1 = v1Plan.items.find(
			(i) => i.feature_id === TestFeature.AdminRights,
		);
		const admin2 = v2Plan.items.find(
			(i) => i.feature_id === TestFeature.AdminRights,
		);
		expect(admin1).toBeUndefined();
		expect(admin2).toBeUndefined();
	},
);

// ═════════════════════════════════════════════════════════════════
// 9. preview_update is read-only
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("feature-drop preview: read-only — no version change, same internal_id")}`,
	async () => {
		const cid = readableVariantTestId("fd_preview_readonly");
		const { ctx, rpc, baseId } = await setupScenario(cid, `fd_base_${cid}`);
		const variantId = `fd_var_${cid}`;

		await createVariant(rpc, baseId, variantId);

		const beforeBase = await getFull(ctx, baseId);
		const beforeVariant = await getFull(ctx, variantId);

		await rpc.post("/plans.preview_update", {
			plan_id: baseId,
			items: [...allItems(), v1.adminRights()],
			price: monthlyPrice,
		});

		const afterBase = await getFull(ctx, baseId);
		const afterVariant = await getFull(ctx, variantId);

		expect(afterBase.internal_id).toBe(beforeBase.internal_id);
		expect(afterBase.version).toBe(beforeBase.version);
		expect(afterVariant.internal_id).toBe(beforeVariant.internal_id);
	},
);

// ═════════════════════════════════════════════════════════════════
// 10. nested_variant_not_allowed
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("feature-drop errors: nested variant → 400 nested_variant_not_allowed")}`,
	async () => {
		const cid = readableVariantTestId("fd_nested_err");
		const { rpc, baseId } = await setupScenario(cid, `fd_base_${cid}`);
		const variantId = `fd_var_${cid}`;
		const nestedId = `fd_nested_${cid}`;

		await createVariant(rpc, baseId, variantId);

		const err = await catchErr(() => createVariant(rpc, variantId, nestedId));
		expect(err).not.toBeNull();
		expect(err?.code).toBe("nested_variant_not_allowed");
	},
);

// ═════════════════════════════════════════════════════════════════
// 11. is_default on variant rejects
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("feature-drop errors: is_default=true on variant → 400 variant_cannot_be_default")}`,
	async () => {
		const cid = readableVariantTestId("fd_default_err");
		const { rpc, baseId } = await setupScenario(cid, `fd_base_${cid}`);
		const variantId = `fd_var_${cid}`;

		await createVariant(rpc, baseId, variantId);

		const err = await catchErr(() =>
			rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, { is_default: true }),
		);
		expect(err).not.toBeNull();
		expect(err?.code).toBe("variant_cannot_be_default");
	},
);

// ═════════════════════════════════════════════════════════════════
// 12. Stripe carry-forward across feature-add
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("feature-drop stripe: variant v2 existing prices retain stripe_price_id, new feature gets fresh")}`,
	async () => {
		const cid = readableVariantTestId("fd_stripe_carry");
		const { ctx, rpc, baseId } = await setupScenario(cid, `fd_base_${cid}`);
		const variantId = `fd_var_${cid}`;

		await createVariant(rpc, baseId, variantId);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, {
			items: itemsNoDashboard(),
			price: monthlyPrice,
			disable_version: true,
		});

		const variantV1 = await getFull(ctx, variantId);
		const v1PriceIds = new Map(
			variantV1.prices
				.filter((p) => p.config?.stripe_price_id)
				.map((p) => [p.entitlement_id ?? "base", p.config?.stripe_price_id]),
		);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [...itemsNoDashboard(), v1.storage()],
			price: monthlyPrice,
			force_version: true,
			propagate_to_variants: [variantId],
		});

		const variantV2 = await getFull(ctx, variantId);
		expect(variantV2.version).toBe(2);

		let carriedForward = 0;
		for (const price of variantV2.prices) {
			const key = price.entitlement_id ?? "base";
			const v1Id = v1PriceIds.get(key);
			if (v1Id && price.config?.stripe_price_id) {
				expect(price.config.stripe_price_id).toBe(v1Id);
				carriedForward++;
			}
		}
		expect(carriedForward).toBeGreaterThan(0);

		const storagePrice = variantV2.prices.find(
			(p) =>
				p.config?.stripe_price_id &&
				!v1PriceIds.has(p.entitlement_id ?? "base"),
		);
		expect(storagePrice).toBeDefined();
		expect(storagePrice?.config?.stripe_price_id).toBeDefined();
	},
);
