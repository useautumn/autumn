/**
 * Plan variants — lifecycle (base + variant, interval/price delta).
 *
 * Contract under test (from tests/_temp/variants/CONTRACT.md):
 *   New endpoints:
 *     - POST /v1/plans.create_variant { plan_id, id, name } → getPlanResponse
 *     - POST /v1/plans.preview_update (UpdatePlanParams omit propagate) → { will_version, current_version, diff, affected_variants }
 *     - POST /v1/plans.update (extended: propagate_to_variants, force_version, is_default)
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

const suffix = () => Math.random().toString(36).slice(2, 8);

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

// ───────────────────────────────────────────────────────────────────
// 1. create_variant happy path
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants create_variant: happy path — base_internal_product_id set, version=1, is_default=false")}`,
	async () => {
		const cid = `pv1_${suffix()}`;
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

		const res = await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
			name: "Yearly Variant",
		});

		const baseFull = await getFull(ctx, base.id);
		const variantFull = await getFull(ctx, variantId);

		expect(variantFull.version).toBe(1);
		expect(variantFull.is_default).toBe(false);
		expect(variantFull.base_internal_product_id).toBe(
			baseFull.internal_id,
		);

		const baseEnt = baseFull.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages,
		);
		const variantEnt = variantFull.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages,
		);
		expect(variantEnt?.allowance).toBe(baseEnt?.allowance);
	},
);

// ───────────────────────────────────────────────────────────────────
// 2. create_variant rejects nested
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants create_variant: rejects nested variant → 400 nested_variant_not_allowed")}`,
	async () => {
		const cid = `pv2_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
			name: "Variant",
		});

		const err = await catchErr(() =>
			rpc.post("/plans.create_variant", {
				plan_id: variantId,
				id: nestedId,
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
		const cid = `pv3_${suffix()}`;
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
			rpc.post("/plans.create_variant", {
				plan_id: base.id,
				id: `lc_var_${cid}`,
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
		const cid = `pv4_${suffix()}`;
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
			rpc.post("/plans.create_variant", {
				plan_id: base.id,
				id: other.id,
				name: "Colliding Variant",
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
		const cid = `pv5_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
			name: "Variant",
		});

		const beforeFull = await getFull(ctx, base.id);

		const res = await rpc.post("/plans.preview_update", {
			plan_id: base.id,
			items: [monthlyItem(200)],
			price: { amount: 30, interval: BillingInterval.Month },
		});

		expect(res.will_version).toBeDefined();
		expect(res.current_version).toBe(1);
		expect(res.diff).toBeDefined();
		expect(Array.isArray(res.affected_variants)).toBe(true);

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
		const cid = `pv6_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
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
	`${chalk.yellowBright("variants update: omit propagate_to_variants → variant unchanged")}`,
	async () => {
		const cid = `pv7_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
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
		const cid = `pv8_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
			name: "Variant",
		});

		const variantBefore = await getFull(ctx, variantId);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
			items: [monthlyItem(200)],
			price: monthlyPrice,
			disable_version: true,
			propagate_to_variants: [variantId],
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
// 9. base patch in place → variant patches in place (even with customers)
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants propagate: base patches in place → variant patches in place even with customers (unified version choice)")}`,
	async () => {
		const cid = `pv9_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
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
			propagate_to_variants: [variantId],
		});

		const baseAfter = await getFull(ctx, base.id);
		const variantAfter = await getFull(ctx, variantId);

		// Base patched in place (no customers on base)
		expect(baseAfter.internal_id).toBe(baseBefore.internal_id);
		expect(baseAfter.version).toBe(1);

		// Variant ALSO patched in place — follows the base's choice, no forced
		// version bump despite having customers. Customers are updated via migration.
		expect(variantAfter.version).toBe(1);
		expect(variantAfter.internal_id).toBe(variantBefore.internal_id);
		expect(variantAfter.base_internal_product_id).toBe(
			baseAfter.internal_id,
		);

		const variantEnt = variantAfter.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages,
		);
		expect(variantEnt?.allowance).toBe(200);
	},
);

// ───────────────────────────────────────────────────────────────────
// 10. base versions + variant versions when base has customers
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants propagate: both version when base has customers — variant v2 base_internal_product_id = base v2 internal_id")}`,
	async () => {
		const cid = `pv10_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
			name: "Variant",
		});

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
			items: [monthlyItem(200)],
			price: monthlyPrice,
			propagate_to_variants: [variantId],
		});

		const baseV2 = await getFull(ctx, base.id);
		const variantV2 = await getFull(ctx, variantId);

		expect(baseV2.version).toBe(2);
		expect(variantV2.version).toBe(2);
		expect(variantV2.base_internal_product_id).toBe(
			baseV2.internal_id,
		);

		const variantEnt = variantV2.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages,
		);
		expect(variantEnt?.allowance).toBe(200);
	},
);

// ───────────────────────────────────────────────────────────────────
// 11. opt-out: omit propagate leaves variant pinned to old base
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants opt-out: omit propagate → base versions, variant stays at v1 pinned to old base")}`,
	async () => {
		const cid = `pv11_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
			name: "Variant",
		});

		const baseV1 = await getFull(ctx, base.id);
		const variantBefore = await getFull(ctx, variantId);

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
			items: [monthlyItem(200)],
			price: monthlyPrice,
		});

		const baseV2 = await getFull(ctx, base.id);
		const variantAfter = await getFull(ctx, variantId);

		expect(baseV2.version).toBe(2);
		expect(variantAfter.version).toBe(1);
		expect(variantAfter.internal_id).toBe(variantBefore.internal_id);
		// Still pinned to old base v1
		expect(variantAfter.base_internal_product_id).toBe(
			baseV1.internal_id,
		);
	},
);

// ───────────────────────────────────────────────────────────────────
// 12. update rejects unrelated id in propagate
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants update: rejects unrelated id in propagate → 400 invalid_propagation_target")}`,
	async () => {
		const cid = `pv12_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
			name: "Variant",
		});

		const err = await catchErr(() =>
			rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
				items: [monthlyItem(200)],
				price: monthlyPrice,
				disable_version: true,
				propagate_to_variants: [`unrelated_${cid}`],
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
		const cid = `pv13_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
			name: "Variant",
		});

		const err = await catchErr(() =>
			rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
				items: [monthlyItem(200)],
				price: monthlyPrice,
				disable_version: true,
				propagate_to_variants: [base.id],
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
		const cid = `pv14_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
			name: "Variant",
		});

		const ids = Array.from({ length: 21 }, (_, i) => `fake_${i}_${cid}`);

		const err = await catchErr(() =>
			rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
				items: [monthlyItem(200)],
				price: monthlyPrice,
				disable_version: true,
				propagate_to_variants: ids,
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
		const cid = `pv15_${suffix()}`;
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
		const cid = `pv16_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
			name: "Variant",
		});

		const baseFull = await getFull(ctx, base.id);
		const variantFull = await getFull(ctx, variantId);

		const basePrice = baseFull.prices.find(
			(p) => p.config?.type === "fixed",
		);
		const variantPrice = variantFull.prices.find(
			(p) => p.config?.type === "fixed",
		);

		expect(basePrice).toBeDefined();
		expect(variantPrice).toBeDefined();
		expect(variantPrice?.config?.stripe_product_id).toBeDefined();
		expect(variantPrice?.config?.stripe_product_id).toBe(
			basePrice?.config?.stripe_product_id,
		);
	},
);

// ───────────────────────────────────────────────────────────────────
// 17. is_default=true on variant rejects
// ───────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("variants update: is_default=true on variant → 400 variant_cannot_be_default")}`,
	async () => {
		const cid = `pv17_${suffix()}`;
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

		await rpc.post("/plans.create_variant", {
			plan_id: base.id,
			id: variantId,
			name: "Variant",
		});

		const err = await catchErr(() =>
			rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, {
				is_default: true,
			}),
		);

		expect(err).not.toBeNull();
		expect(err?.code).toBe("variant_cannot_be_default");
	},
);
