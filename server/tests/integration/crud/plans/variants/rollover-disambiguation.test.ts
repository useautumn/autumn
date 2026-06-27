/**
 * TDD test for plan variants — rollover disambiguation.
 *
 * Contract under test:
 *   New endpoints:
 *     - POST /v1/plans.create_variant -> ApiPlanV1
 *     - POST /v1/plans.preview_update -> PlanUpdatePreview
 *     - POST /v1/plans.update (extended with propagate_to_variants)
 *   New behaviors:
 *     - create_variant copies items including rollover config
 *     - create_variant preserves duplicate feature_id items + Stripe product reuse
 *     - preview_update diff on rollover change produces remove_items + add_items
 *     - propagate rollover change to variant (versioning, v1 untouched)
 *     - variant strips an item, subsequent propagation preserves strip
 *     - filter precision: same feature_id, different reset.interval
 *     - base versions on rollover change with customer (both base and variant version)
 *     - preview_update returns 0 writes when nothing changes
 *     - stripe_prepaid_price_v2_id carried forward on versioning
 *     - create_variant rejects archived base (cannot_fork_archived_base)
 *     - base+variant both have customers → both version, variant pins to new base
 *   Error codes:
 *     - cannot_fork_archived_base (400)
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	type PlanUpdatePreview,
	ResetInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import {
	expectStripeResourcesCarriedToVariant,
	expectVariantProductCorrect,
} from "./utils/expectVariantProductCorrect.js";
import {
	expectPreviewItemChangeCorrect,
	expectPreviewVariantsCorrect,
} from "./utils/expectVariantPreviewCorrect.js";
import { readableVariantTestId } from "./utils/readableVariantTestId.js";
import {
	createVariantPlan,
	deleteVariantTestCustomers,
	deleteVariantTestPlans,
} from "./utils/variantTestPlanUtils.js";

const { db, org, env } = ctx;
const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });

const cleanup = async (...ids: string[]) => {
	await deleteVariantTestPlans({ rpc: autumnRpc, planIds: ids });
};
const cleanupCustomers = async (...customerIds: string[]) => {
	await deleteVariantTestCustomers({ client: autumnV1_2, customerIds });
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// CREDITS with rollover (monthly, free metered) + CREDITS daily (same feature_id, different interval) + Messages
const rolloverBaseItems = (rolloverMax = 200) => [
	{
		feature_id: TestFeature.Credits,
		included: 500,
		reset: { interval: ResetInterval.Month },
		rollover: {
			max: rolloverMax,
			expiry_duration_type: RolloverExpiryDurationType.Month,
			expiry_duration_length: 1,
		},
	},
	{
		feature_id: TestFeature.Credits,
		included: 50,
		reset: { interval: ResetInterval.Day },
	},
	{
		feature_id: TestFeature.Messages,
		included: 1000,
		reset: { interval: ResetInterval.Month },
	},
];

const rolloverPrepaidItems = (rolloverMax = 200) => [
	{
		feature_id: TestFeature.Credits,
		included: 0,
		reset: { interval: ResetInterval.Month },
		price: {
			amount: 10,
			interval: BillingInterval.Month,
			billing_units: 100,
			billing_method: BillingMethod.Prepaid,
		},
		rollover: {
			max: rolloverMax,
			expiry_duration_type: RolloverExpiryDurationType.Month,
			expiry_duration_length: 1,
		},
	},
	{
		feature_id: TestFeature.Messages,
		included: 1000,
		reset: { interval: ResetInterval.Month },
	},
];

const rolloverBaseItemsPriced = (rolloverMax = 200) => [
	{
		feature_id: TestFeature.Credits,
		included: 500,
		reset: { interval: ResetInterval.Month },
		rollover: {
			max: rolloverMax,
			expiry_duration_type: RolloverExpiryDurationType.Month,
			expiry_duration_length: 1,
		},
		price: {
			amount: 1,
			interval: BillingInterval.Month,
			billing_units: 1,
			billing_method: BillingMethod.UsageBased,
		},
	},
	{
		feature_id: TestFeature.Credits,
		included: 50,
		reset: { interval: ResetInterval.Day },
		price: {
			amount: 1,
			interval: BillingInterval.Month,
			billing_units: 1,
			billing_method: BillingMethod.Prepaid,
		},
	},
	{
		feature_id: TestFeature.Messages,
		included: 1000,
		reset: { interval: ResetInterval.Month },
	},
];

const createBase = async (id: string, items: ReturnType<typeof rolloverBaseItems> | ReturnType<typeof rolloverPrepaidItems> | ReturnType<typeof rolloverBaseItemsPriced>) => {
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: id,
		name: `Rollover Base ${id}`,
		group: `rv_${id}`,
		items,
	});
	return await ProductService.getFull({ db, idOrInternalId: id, orgId: org.id, env });
};

const createVariant = async (baseId: string, variantId: string) => {
	return await createVariantPlan<ApiPlanV1>({
		rpc: autumnRpc,
		basePlanId: baseId,
		variantPlanId: variantId,
		name: `Rollover Variant ${variantId}`,
	});
};

const getVariantPlan = async (variantId: string) => {
	return await autumnRpc.plans.get<ApiPlanV1>(variantId);
};

const getAllVersions = async (planId: string) => {
	return await ProductService.listFull({ db, orgId: org.id, env, inIds: [planId], returnAll: true });
};

// ═══════════════════════════════════════════════════════════════════
// 1. create_variant copies items including rollover
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("rollover create_variant: copies items including rollover config")}`,
	async () => {
			const rid = readableVariantTestId("rv_copy_rollover");
			const baseId = `base_${rid}`;
			const variantId = `${baseId}_variant`;
		await cleanup(baseId, variantId);

		await createBase(baseId, rolloverBaseItems(200));
		const variant = await createVariant(baseId, variantId);

		const creditsMonthly = variant.items.find(
			(i: any) => i.feature_id === TestFeature.Credits && i.reset?.interval === "month",
		);
		expect(creditsMonthly).toBeDefined();
		expect(creditsMonthly!.rollover).toBeDefined();
		expect(creditsMonthly!.rollover!.max).toBe(200);
		expect(creditsMonthly!.rollover!.expiry_duration_type).toBe(RolloverExpiryDurationType.Month);

		const creditsDaily = variant.items.find(
			(i: any) => i.feature_id === TestFeature.Credits && i.reset?.interval === "day",
		);
		expect(creditsDaily).toBeDefined();
		expect(creditsDaily!.rollover).toBeUndefined();

		expect(variant.items.find((i: any) => i.feature_id === TestFeature.Messages)).toBeDefined();

		await cleanup(baseId, variantId);
	},
);

// ═══════════════════════════════════════════════════════════════════
// 2. create_variant preserves duplicate feature_id items + Stripe reuse
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("rollover create_variant: preserves duplicate feature_id items + Stripe reuse")}`,
	async () => {
		const rid = readableVariantTestId("rv_dups_stripe");
		const baseId = `base_${rid}`;
		const variantId = `${baseId}_variant`;
		await cleanup(baseId, variantId);

		const base = await createBase(baseId, rolloverBaseItemsPriced(200));
		await createVariant(baseId, variantId);
		const variantFull = await ProductService.getFull({ db, idOrInternalId: variantId, orgId: org.id, env });

		const baseCreditsPrices = base.prices.filter((p: any) => p.config?.feature_id === TestFeature.Credits);
		const variantCreditsPrices = variantFull.prices.filter((p: any) => p.config?.feature_id === TestFeature.Credits);

		expect(variantCreditsPrices.length).toBe(baseCreditsPrices.length);
		expect(variantCreditsPrices.length).toBeGreaterThanOrEqual(2);

		expectStripeResourcesCarriedToVariant({
			base,
			variant: variantFull,
			requireMeter: true,
		});

		await cleanup(baseId, variantId);
	},
);

// ═══════════════════════════════════════════════════════════════════
// 3. preview_update diff on rollover change
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("rollover preview_update: diff on rollover change produces remove + add")}`,
	async () => {
		const baseId = readableVariantTestId("rv_preview_diff");
		await cleanup(baseId);

		await createBase(baseId, rolloverBaseItems(200));

		const modifiedItems = rolloverBaseItems(500);
		const preview = await autumnRpc.rpc.call<PlanUpdatePreview>({
			method: "/plans.preview_update",
			body: { plan_id: baseId, items: modifiedItems },
		});

		expect(preview.versionable).toBe(false);
		expectPreviewItemChangeCorrect({
			preview,
			action: "deleted",
			featureId: TestFeature.Credits,
		});
		expectPreviewItemChangeCorrect({
			preview,
			action: "created",
			featureId: TestFeature.Credits,
		});
		expectPreviewVariantsCorrect({ preview, variants: [] });

		await cleanup(baseId);
	},
);

// ═══════════════════════════════════════════════════════════════════
// 4. propagate rollover change to variant
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("rollover propagate: rollover change to variant (versioning, v1 untouched)")}`,
	async () => {
			const rid = readableVariantTestId("rv_prop_rollover");
			const baseId = `base_${rid}`;
			const variantId = `${baseId}_variant`;
			const customerId = `cus_${rid}`;
		await cleanupCustomers(customerId);
		await cleanup(baseId, variantId);

		await createBase(baseId, rolloverBaseItems(200));
		await createVariant(baseId, variantId);

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		await autumnV1.attach({ customer_id: customerId, product_id: variantId });
		await wait(3000);

		await autumnRpc.plans.update<ApiPlanV1>(baseId, {
			items: rolloverBaseItems(500),
			propagate_to_variants: [variantId],
		});

		const variantVersions = await getAllVersions(variantId);
		expect(variantVersions.length).toBe(2);

		const v2 = variantVersions.find((v: any) => v.version === 2);
		const v1 = variantVersions.find((v: any) => v.version === 1);
		expect(v2).toBeDefined();
		expect(v1).toBeDefined();

		const v2Plan = await getVariantPlan(variantId);
		const v2CreditsMonthly = v2Plan.items.find(
			(i: any) => i.feature_id === TestFeature.Credits && i.reset?.interval === "month",
		);
		expect(v2CreditsMonthly).toBeDefined();
		expect(v2CreditsMonthly!.rollover!.max).toBe(500);

		const v1Plan = await ProductService.getFull({ db, idOrInternalId: variantId, orgId: org.id, env, version: 1 });
		const v1CreditsPrices = v1Plan.prices.filter((p: any) => p.config?.feature_id === TestFeature.Credits);
		const v2CreditsPrices = v2!.prices.filter((p: any) => p.config?.feature_id === TestFeature.Credits);
		expect(v2CreditsPrices.length).toBe(v1CreditsPrices.length);

		await cleanup(baseId, variantId);
	},
);

// ═══════════════════════════════════════════════════════════════════
// 5. variant strips an item, subsequent propagation preserves strip
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("rollover propagate: variant strip preserved across propagation")}`,
	async () => {
			const rid = readableVariantTestId("rv_strip_preserve");
			const baseId = `base_${rid}`;
			const variantId = `${baseId}_variant`;
			const customerId = `cus_${rid}`;
		await cleanupCustomers(customerId);
		await cleanup(baseId, variantId);

		await createBase(baseId, rolloverBaseItems(200));
		await createVariant(baseId, variantId);

		await autumnRpc.plans.update<ApiPlanV1>(variantId, {
			items: [
				{
					feature_id: TestFeature.Credits,
					included: 500,
					reset: { interval: ResetInterval.Month },
					rollover: { max: 200, expiry_duration_type: RolloverExpiryDurationType.Month, expiry_duration_length: 1 },
				},
				{
					feature_id: TestFeature.Messages,
					included: 1000,
					reset: { interval: ResetInterval.Month },
				},
			],
		});

		const strippedVariant = await getVariantPlan(variantId);
		expect(strippedVariant.items.find((i: any) => i.feature_id === TestFeature.Credits && i.reset?.interval === "day")).toBeUndefined();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		await autumnV1.attach({ customer_id: customerId, product_id: baseId });
		await wait(3000);

		await autumnRpc.plans.update<ApiPlanV1>(baseId, {
			items: [
				...rolloverBaseItems(200),
				{ feature_id: TestFeature.Dashboard },
			],
			propagate_to_variants: [variantId],
		});

		const variantVersions = await getAllVersions(variantId);
		expect(variantVersions.length).toBe(2);

		const v2Plan = await getVariantPlan(variantId);
		expect(v2Plan.items.find((i: any) => i.feature_id === TestFeature.Dashboard)).toBeDefined();
		expect(v2Plan.items.find((i: any) => i.feature_id === TestFeature.Credits && i.reset?.interval === "month")).toBeDefined();
		expect(v2Plan.items.find((i: any) => i.feature_id === TestFeature.Messages)).toBeDefined();
		expect(v2Plan.items.find((i: any) => i.feature_id === TestFeature.Credits && i.reset?.interval === "day")).toBeUndefined();

		await cleanup(baseId, variantId);
	},
);

// ═══════════════════════════════════════════════════════════════════
// 6. filter precision: same feature_id, different reset.interval
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("rollover filter precision: same feature_id different interval, only targeted item changes")}`,
	async () => {
			const rid = readableVariantTestId("rv_filter_precision");
			const baseId = `base_${rid}`;
			const variantId = `${baseId}_variant`;
			const customerId = `cus_${rid}`;
		await cleanupCustomers(customerId);
		await cleanup(baseId, variantId);

		await createBase(baseId, rolloverBaseItems(200));
		await createVariant(baseId, variantId);

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		await autumnV1.attach({ customer_id: customerId, product_id: baseId });
		await wait(3000);

		const modifiedItems = [
			{
				feature_id: TestFeature.Credits,
				included: 500,
				reset: { interval: ResetInterval.Month },
				rollover: { max: 200, expiry_duration_type: RolloverExpiryDurationType.Month, expiry_duration_length: 1 },
			},
			{
				feature_id: TestFeature.Credits,
				included: 100,
				reset: { interval: ResetInterval.Day },
			},
			{
				feature_id: TestFeature.Messages,
				included: 1000,
				reset: { interval: ResetInterval.Month },
			},
		];

		await autumnRpc.plans.update<ApiPlanV1>(baseId, {
			items: modifiedItems,
			propagate_to_variants: [variantId],
		});

		const variantVersions = await getAllVersions(variantId);
		expect(variantVersions.length).toBe(2);

		const v2Plan = await getVariantPlan(variantId);
		const dayCredits = v2Plan.items.find(
			(i: any) => i.feature_id === TestFeature.Credits && i.reset?.interval === "day",
		);
		expect(dayCredits).toBeDefined();
		expect(dayCredits!.included).toBe(100);

		const monthCredits = v2Plan.items.find(
			(i: any) => i.feature_id === TestFeature.Credits && i.reset?.interval === "month",
		);
		expect(monthCredits).toBeDefined();
		expect(monthCredits!.included).toBe(500);
		expect(monthCredits!.rollover).toBeDefined();
		expect(monthCredits!.rollover!.max).toBe(200);

		await cleanup(baseId, variantId);
	},
);

// ═══════════════════════════════════════════════════════════════════
// 7. base versions on rollover change with customer
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("rollover base+variant version: customer on base triggers both versioning")}`,
	async () => {
			const rid = readableVariantTestId("rv_base_variant_version");
			const baseId = `base_${rid}`;
			const variantId = `${baseId}_variant`;
			const customerId = `cus_${rid}`;
		await cleanupCustomers(customerId);
		await cleanup(baseId, variantId);

		await createBase(baseId, rolloverBaseItems(200));
		await createVariant(baseId, variantId);

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		await autumnV1.attach({ customer_id: customerId, product_id: baseId });
		await wait(3000);

		await autumnRpc.plans.update<ApiPlanV1>(baseId, {
			items: rolloverBaseItems(500),
			propagate_to_variants: [variantId],
		});

		const baseVersions = await getAllVersions(baseId);
		expect(baseVersions.length).toBe(2);
		expect(baseVersions.find((v: any) => v.version === 2)).toBeDefined();

		const variantVersions = await getAllVersions(variantId);
		expect(variantVersions.length).toBe(2);
		expect(variantVersions.find((v: any) => v.version === 2)).toBeDefined();

		const newBase = baseVersions.find((v: any) => v.version === 2)!;
		const newVariant = variantVersions.find((v: any) => v.version === 2)!;
		expectVariantProductCorrect({
			base: newBase,
			variant: newVariant,
			version: 2,
		});

		await cleanup(baseId, variantId);
	},
);

// ═══════════════════════════════════════════════════════════════════
// 8. preview_update returns 0 writes
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("rollover preview_update: 0 writes when nothing changes")}`,
	async () => {
			const baseId = readableVariantTestId("rv_preview_zero_writes");
		await cleanup(baseId);

		await createBase(baseId, rolloverBaseItems(200));

		const before = await ProductService.getFull({ db, idOrInternalId: baseId, orgId: org.id, env });

		const preview = await autumnRpc.rpc.call<PlanUpdatePreview>({
			method: "/plans.preview_update",
			body: { plan_id: baseId, items: rolloverBaseItems(200) },
		});

		expect(preview.versionable).toBe(false);
		expect(preview.customize?.add_items ?? []).toHaveLength(0);
		expect(preview.customize?.remove_items ?? []).toHaveLength(0);

		const after = await ProductService.getFull({ db, idOrInternalId: baseId, orgId: org.id, env });
		expect(after.version).toBe(before.version);
		expect(after.internal_id).toBe(before.internal_id);

		await cleanup(baseId);
	},
);

// ═══════════════════════════════════════════════════════════════════
// 9. stripe_prepaid_price_v2_id carried forward on versioning
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("rollover versioning: stripe_prepaid_price_v2_id carried forward to variant v2")}`,
	async () => {
			const rid = readableVariantTestId("rv_prepaid_carry");
			const baseId = `base_${rid}`;
			const variantId = `${baseId}_variant`;
			const customerId = `cus_${rid}`;
		await cleanupCustomers(customerId);
		await cleanup(baseId, variantId);

		await createBase(baseId, rolloverPrepaidItems(200));
		await createVariant(baseId, variantId);

		const variantV1 = await ProductService.getFull({ db, idOrInternalId: variantId, orgId: org.id, env });
		const v1PrepaidPrice = variantV1.prices.find(
			(p: any) => p.config?.feature_id === TestFeature.Credits && p.config?.stripe_prepaid_price_v2_id,
		);
		expect(v1PrepaidPrice).toBeDefined();
		expect((v1PrepaidPrice!.config as any)?.stripe_price_id).toBeTruthy();
		expect((v1PrepaidPrice!.config as any)?.stripe_prepaid_price_v2_id).toBeTruthy();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false, paymentMethod: "success" })],
			actions: [],
		});
		await autumnV1.attach({ customer_id: customerId, product_id: variantId, options: [{ feature_id: TestFeature.Credits, quantity: 500 }] });
		await wait(4000);

		await autumnRpc.plans.update<ApiPlanV1>(baseId, {
			items: rolloverPrepaidItems(500),
			propagate_to_variants: [variantId],
		});

		const variantVersions = await getAllVersions(variantId);
		expect(variantVersions.length).toBe(2);

		const v2 = variantVersions.find((v: any) => v.version === 2)!;
		const v2PrepaidPrice = v2.prices.find(
			(p: any) => p.config?.feature_id === TestFeature.Credits && p.config?.stripe_prepaid_price_v2_id,
		);
		expect(v2PrepaidPrice).toBeDefined();
		expect((v2PrepaidPrice!.config as any)?.stripe_price_id).toBeTruthy();
		expect((v2PrepaidPrice!.config as any)?.stripe_prepaid_price_v2_id).toBeTruthy();

		await cleanup(baseId, variantId);
	},
);

// ═══════════════════════════════════════════════════════════════════
// 10. create_variant rejects archived base
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("rollover create_variant: rejects archived base with cannot_fork_archived_base")}`,
	async () => {
			const rid = readableVariantTestId("rv_archived_err");
			const baseId = `base_${rid}`;
			const variantId = `${baseId}_variant`;
		await cleanup(baseId, variantId);

		await createBase(baseId, rolloverBaseItems(200));

		await autumnRpc.plans.update<ApiPlanV1>(baseId, { archived: true });
		const archived = await ProductService.getFull({ db, idOrInternalId: baseId, orgId: org.id, env });
		expect(archived.archived).toBe(true);

		try {
			await createVariant(baseId, variantId);
			expect.unreachable("Should have thrown");
		} catch (err: any) {
			expect(err.code).toBe("cannot_fork_archived_base");
			expect(err.statusCode).toBe(400);
		}

		await cleanup(baseId, variantId);
	},
);

// ═══════════════════════════════════════════════════════════════════
// 11. base+variant both have customers → both version
// ═══════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("rollover both customers: base+variant both version, variant pins to new base")}`,
	async () => {
			const rid = readableVariantTestId("rv_both_customers");
			const baseId = `base_${rid}`;
			const variantId = `${baseId}_variant`;
			const baseCusId = `base_cus_${rid}`;
			const varCusId = `variant_cus_${rid}`;
		await cleanupCustomers(baseCusId, varCusId);
		await cleanup(baseId, variantId);

		await createBase(baseId, rolloverBaseItems(200));
		await createVariant(baseId, variantId);

		const { autumnV1 } = await initScenario({
			customerId: baseCusId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		await autumnV1.attach({ customer_id: baseCusId, product_id: baseId });
		await wait(3000);

		const { autumnV1: autumnV1b } = await initScenario({
			customerId: varCusId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		await autumnV1b.attach({ customer_id: varCusId, product_id: variantId });
		await wait(3000);

		await autumnRpc.plans.update<ApiPlanV1>(baseId, {
			items: rolloverBaseItems(500),
			propagate_to_variants: [variantId],
		});

		const baseVersions = await getAllVersions(baseId);
		expect(baseVersions.length).toBe(2);

		const variantVersions = await getAllVersions(variantId);
		expect(variantVersions.length).toBe(2);

		const newBase = baseVersions.find((v: any) => v.version === 2)!;
		const newVariant = variantVersions.find((v: any) => v.version === 2)!;
		expectVariantProductCorrect({
			base: newBase,
			variant: newVariant,
			version: 2,
		});

		const oldVariant = variantVersions.find((v: any) => v.version === 1)!;
		expect(oldVariant.base_internal_product_id).not.toBe(newBase.internal_id);

		await cleanup(baseId, variantId);
	},
);
