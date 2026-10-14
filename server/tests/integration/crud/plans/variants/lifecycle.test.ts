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
import { expectPreviewUpdatePlanCorrect } from "../previewUpdate/utils/expectPreviewUpdatePlanCorrect.js";
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

test.concurrent(
	`${chalk.yellowBright("variants preview_update: supported on variant, previews its own changes")}`,
	async () => {
		const cid = readableVariantTestId("lc_preview_variant_ok");
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

		const preview = (await rpc.post("/plans.preview_update", {
			plan_id: variantId,
			items: [monthlyItem(200)],
		})) as { versionable: boolean };

		expect(preview.versionable).toBe(false);
	},
);

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

		expect(variantAfter.internal_id).toBe(variantBefore.internal_id);
		expect(variantAfter.version).toBe(1);

		const variantEnt = variantAfter.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages,
		);
		expect(variantEnt?.allowance).toBe(200);
	},
);

test.concurrent(
	`${chalk.yellowBright("variants propagate: base patches in place → customer-bearing variant patches in place (disable_version cascades)")}`,
	async () => {
		const cid = readableVariantTestId("lc_prop_base_in_place");
		const base = baseProduct(`lc_base_${cid}`);

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
		const variantId = `lc_var_${cid}`;

		await createVariant(rpc, {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Variant",
		});

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

		expect(baseAfter.internal_id).toBe(baseBefore.internal_id);
		expect(baseAfter.version).toBe(1);

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
		expect(err?.code).toBe("invalid_propagation_target");
	},
);
