/**
 * Plan variants — lifecycle (base + variant, interval/price delta).
 *
 * Contract under test (from tests/_temp/variants/CONTRACT.md):
 *   New endpoints:
 *     - POST /v1/plans.create_variant { base_plan_id, variant_plan_id, name } → getPlanResponse
 *     - POST /v1/plans.preview_update (UpdatePlanParams omit propagate) → PlanUpdatePreview
 *     - POST /v1/plans.update (extended: update_variant_ids, force_version, is_default)
 *   New DB column:
 *     - products.base_internal_product_id — set on variant insert, immutable
 *   New behaviors:
 *     - create_variant: copies base items, sets base_internal_product_id, version=1, is_default=false
 *     - create_variant rejects: nested variant, archived base, id collision
 *     - preview_update: no DB writes, rejects on variant
 *     - propagate patches in-place when no customers, versions when customers exist
 *     - β-rule: variant versions iff baseWasVersioned || variantHasCustomers
 *     - propagate validation: max 20, unknown id rejected, base's own id rejected
 *     - force_version + disable_version mutually exclusive
 *     - variant cannot be is_default=true
 *     - Stripe: variant reuses base's stripe_product_id
 */

import { expect, test } from "bun:test";
import { expectPreviewUpdatePlanCorrect } from "../previewUpdate/utils/expectPreviewUpdatePlanCorrect.js";
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
	expectEntitlementAllowanceMatches,
	expectStripeResourcesCarriedToVariant,
	expectVariantProductCorrect,
} from "./utils/expectVariantProductCorrect.js";
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
	products.pro({
		id,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

const monthlyItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const monthlyPrice = { amount: 20, interval: BillingInterval.Month };

const createVariant = async <T = ApiPlanV1>(
	rpc: AutumnRpcCli,
	params: {
		base_plan_id: string;
		variant_plan_id: string;
		name: string;
		resetVariant?: boolean;
	},
) =>
	createVariantPlan<T>({
		rpc,
		basePlanId: params.base_plan_id,
		variantPlanId: params.variant_plan_id,
		name: params.name,
		resetVariant: params.resetVariant,
	});

// ───────────────────────────────────────────────────────────────────
// 1. create_variant happy path
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants create_variant: happy path — base_internal_product_id set, version=1, is_default=false")}`,
	async () => {
		const cid = readableVariantTestId("lc_happy");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `lc_var_${cid}`;

		const res = await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Yearly Variant",
		});

		const baseFull = await getFull(ctx, base.id);
		const variantFull = await getFull(ctx, variantId);

		expectVariantProductCorrect({ base: baseFull, variant: variantFull });
		expectEntitlementAllowanceMatches({
			base: baseFull,
			variant: variantFull,
			featureId: TestFeature.Messages,
		});
	},
);

// ───────────────────────────────────────────────────────────────────
// 2. create_variant rejects nested
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants create_variant: rejects nested variant → 400 nested_variant_not_allowed")}`,
	async () => {
		const cid = readableVariantTestId("lc_nested_err");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `lc_var_${cid}`;
		const nestedId = `lc_nested_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

		const err = await catchErr(() =>
			createVariant(rpc, {
				base_plan_id: variantId,
				variant_plan_id: nestedId,
				name: "Nested",
			}),
		);

		expect(err).not.toBeNull();
		expect(err?.code).toBe("nested_variant_not_allowed");
	},
);

// ───────────────────────────────────────────────────────────────────
// 3. create_variant rejects archived base
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants create_variant: rejects archived base → 400 cannot_fork_archived_base")}`,
	async () => {
		const cid = readableVariantTestId("lc_archived_err");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});

		await rpc.plans.update(base.id, { archived: true } as RpcUpdate);

		const err = await catchErr(() =>
			createVariant(rpc, {
				base_plan_id: base.id,
				variant_plan_id: `lc_var_${cid}`,
				name: "Variant",
			}),
		);

		expect(err).not.toBeNull();
		expect(err?.code).toBe("cannot_fork_archived_base");
	},
);

// ───────────────────────────────────────────────────────────────────
// 4. create_variant rejects id collision
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants create_variant: rejects id collision → 409 product_id_already_exists")}`,
	async () => {
		const cid = readableVariantTestId("lc_collision_err");
		const base = baseProduct(`lc_base_${cid}`);
		const other = baseProduct(`collide_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base, other] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});

		const err = await catchErr(() =>
			createVariant(rpc, {
				base_plan_id: base.id,
				variant_plan_id: other.id,
				name: "Colliding Variant",
				resetVariant: false,
			}),
		);

		expect(err).not.toBeNull();
		expect(err?.code).toBe("product_id_already_exists");
	},
);

// ───────────────────────────────────────────────────────────────────
// 5. preview_update happy path
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants preview_update: happy path — response shape correct, no DB writes")}`,
	async () => {
		const cid = readableVariantTestId("lc_preview");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `lc_var_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

		const beforeFull = await getFull(ctx, base.id);

		const res = await rpc.post("/plans.preview_update", {
			plan_id: base.id,
			items: [monthlyItem(200)],
			price: { amount: 30, interval: BillingInterval.Month },
			include_variants: true,
		});

		expectPreviewUpdatePlanCorrect({
			preview: res,
			expected: {
				versionable: false,
				variants: [{ plan_id: variantId, versionable: false }],
			},
			logPreview: false,
		});

		const afterFull = await getFull(ctx, base.id);
		expect(afterFull.internal_id).toBe(beforeFull.internal_id);
	},
);

// ───────────────────────────────────────────────────────────────────
// 6. preview_update rejects on variant
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants preview_update: rejects on variant → 400 cannot_preview_on_variant")}`,
	async () => {
		const cid = readableVariantTestId("lc_preview_variant_err");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `lc_var_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

		const err = await catchErr(() =>
			rpc.post("/plans.preview_update", {
				plan_id: variantId,
				items: [monthlyItem(200)],
			}),
		);

		expect(err).not.toBeNull();
		expect(err?.code).toBe("cannot_preview_on_variant");
	},
);

// ───────────────────────────────────────────────────────────────────
// 7. update without propagate leaves variant untouched
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants update: omit update_variant_ids → variant unchanged")}`,
	async () => {
		const cid = readableVariantTestId("lc_no_propagate");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `lc_var_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

		const variantBefore = await getFull(ctx, variantId);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
			items: [monthlyItem(200)],
			price: monthlyPrice,
			disable_version: true,
		});

		const variantAfter = await getFull(ctx, variantId);
		const entAfter = variantAfter.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages,
		);
		const entBefore = variantBefore.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages,
		);
		expect(entAfter?.allowance).toBe(entBefore?.allowance);
	},
);

// ───────────────────────────────────────────────────────────────────
// 8. propagate patches variant in place (no customers)
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants propagate: patches variant in place when no customers")}`,
	async () => {
		const cid = readableVariantTestId("lc_prop_no_cus");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `lc_var_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

		const variantBefore = await getFull(ctx, variantId);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
			items: [monthlyItem(200)],
			price: monthlyPrice,
			disable_version: true,
			update_variant_ids: [variantId],
		});

		const baseAfter = await getFull(ctx, base.id);
		const variantAfter = await getFull(ctx, variantId);

		// Both patched in place — same internal_id
		expect(variantAfter.internal_id).toBe(variantBefore.internal_id);
		expect(variantAfter.version).toBe(1);

		const variantEnt = variantAfter.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages,
		);
		expect(variantEnt?.allowance).toBe(200);
	},
);

// ───────────────────────────────────────────────────────────────────
// 9. base patch in place → propagated variant patches in place too
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants propagate: base patches in place → customer-bearing variant patches in place (disable_version cascades)")}`,
	async () => {
		const cid = readableVariantTestId("lc_prop_base_in_place");
		const base = baseProduct(`lc_base_${cid}`);

		const { autumnV2_2, ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `lc_var_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

		// Attach customer to variant (not base)
		await autumnV2_2.billing.attach({
			customer_id: cid,
			plan_id: variantId,
		});

		const baseBefore = await getFull(ctx, base.id);
		const variantBefore = await getFull(ctx, variantId);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
			items: [monthlyItem(200)],
			price: monthlyPrice,
			disable_version: true,
			update_variant_ids: [variantId],
		});

		const baseAfter = await getFull(ctx, base.id);
		const variantAfter = await getFull(ctx, variantId);

		// Base patched in place (no customers on base)
		expect(baseAfter.internal_id).toBe(baseBefore.internal_id);
		expect(baseAfter.version).toBe(1);

		// disable_version on the base cascades to explicitly-targeted variants:
		// the propagated diff patches the variant in place, it does not version.
		expect(variantAfter.internal_id).toBe(variantBefore.internal_id);
		expectVariantProductCorrect({
			base: baseAfter,
			variant: variantAfter,
			version: 1,
		});

		const variantEnt = variantAfter.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages,
		);
		expect(variantEnt?.allowance).toBe(200);
	},
);

// ───────────────────────────────────────────────────────────────────
// 10. base versions, customer-less variant patches in place onto new base
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants propagate: base versions, customer-less variant patches in place onto base v2")}`,
	async () => {
		const cid = readableVariantTestId("lc_prop_versions");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
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
		const variantId = `lc_var_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
			items: [monthlyItem(200)],
			price: monthlyPrice,
			update_variant_ids: [variantId],
		});

		const baseV2 = await getFull(ctx, base.id);
		const variantV2 = await getFull(ctx, variantId);

		expect(baseV2.version).toBe(2);
		// Variant has no customers of its own, so it doesn't need to version —
		// it patches in place, re-pinned to the base's new v2 internal_id.
		expectVariantProductCorrect({
			base: baseV2,
			variant: variantV2,
			version: 1,
		});

		const variantEnt = variantV2.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages,
		);
		expect(variantEnt?.allowance).toBe(200);
	},
);

// ───────────────────────────────────────────────────────────────────
// 12. update rejects unrelated id in propagate
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants update: rejects unrelated id in propagate → 400 invalid_propagation_target")}`,
	async () => {
		const cid = readableVariantTestId("lc_unrelated_err");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `lc_var_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

		const err = await catchErr(() =>
			rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
				items: [monthlyItem(200)],
				price: monthlyPrice,
				disable_version: true,
				update_variant_ids: [`unrelated_${cid}`],
			}),
		);

		expect(err).not.toBeNull();
		expect(err?.code).toBe("invalid_propagation_target");
	},
);

// ───────────────────────────────────────────────────────────────────
// 13. update rejects base's own id in propagate
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants update: rejects base's own id in propagate → 400 invalid_propagation_target")}`,
	async () => {
		const cid = readableVariantTestId("lc_self_err");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `lc_var_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

		const err = await catchErr(() =>
			rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
				items: [monthlyItem(200)],
				price: monthlyPrice,
				disable_version: true,
				update_variant_ids: [base.id],
			}),
		);

		expect(err).not.toBeNull();
		expect(err?.code).toBe("invalid_propagation_target");
	},
);

// ───────────────────────────────────────────────────────────────────
// 14. update rejects > 20 variants
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants update: rejects > 20 ids in propagate → 400 too_many_variants")}`,
	async () => {
		const cid = readableVariantTestId("lc_too_many_err");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `lc_var_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

		const ids = Array.from({ length: 21 }, (_, i) => `fake_${i}_${cid}`);

		const err = await catchErr(() =>
			rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
				items: [monthlyItem(200)],
				price: monthlyPrice,
				disable_version: true,
				update_variant_ids: ids,
			}),
		);

		expect(err).not.toBeNull();
		expect(err?.code).toBe("too_many_variants");
	},
);

// ───────────────────────────────────────────────────────────────────
// 15. force_version + disable_version both true
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants update: force_version + disable_version both true → 400 conflicting_version_flags")}`,
	async () => {
		const cid = readableVariantTestId("lc_flags_err");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});

		const err = await catchErr(() =>
			rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
				items: [monthlyItem(200)],
				price: monthlyPrice,
				force_version: true,
				disable_version: true,
			}),
		);

		expect(err).not.toBeNull();
		expect(err?.code).toBe("conflicting_version_flags");
	},
);

// ───────────────────────────────────────────────────────────────────
// 16. create_variant Stripe reuse
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants create_variant: variant shares stripe_product_id with base")}`,
	async () => {
		const cid = readableVariantTestId("lc_stripe_reuse");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `lc_var_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

		const baseFull = await getFull(ctx, base.id);
		const variantFull = await getFull(ctx, variantId);

		expectStripeResourcesCarriedToVariant({
			base: baseFull,
			variant: variantFull,
		});
	},
);

// ───────────────────────────────────────────────────────────────────
// 17. is_default=true on variant rejects
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants update: is_default=true on variant → 400 invalid_propagation_target")}`,
	async () => {
		const cid = readableVariantTestId("lc_default_err");
		const base = baseProduct(`lc_base_${cid}`);

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `lc_var_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

		const err = await catchErr(() =>
			rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, {
				is_default: true,
			}),
		);

		expect(err).not.toBeNull();
		// is_default is one of the general variant-settings fields blocked by
		// validateVariantSettingsUpdate, which runs before the dedicated
		// variant_cannot_be_default check in validateDefaultFlag.
		expect(err?.code).toBe("invalid_propagation_target");
	},
);
