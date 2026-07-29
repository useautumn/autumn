/**
 * Contract catch-all for plan variants: edge cases + error paths.
 *
 * Contract under test (from _temp/variants/CONTRACT.md):
 *   - force_version + disable_version mutually exclusive → conflicting_version_flags
 *   - force_version bypasses customer-check, always versions
 *   - base_internal_product_id set on insert and mutable through base_plan_id
 *   - create_variant returns ApiPlanV1 shape
 *   - preview_update is idempotent, no writes
 *   - archived variants silently filtered from propagate
 *   - preview_update.versionable matches actual update
 *   - preview_update.diff matches manual diffPlanV1
 *   - update_variant_ids:[] ≡ omitted
 *   - invalid propagation targets rejected
 *   - create_variant id collision → 409
 *   - variant visible in plans.list
 *   - preview_update variants always present
 *   - free_trial propagation overwrites variant override
 */

import { beforeAll, expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiPlanV1Schema,
	ApiVersion,
	BillingInterval,
	type CreatePlanParamsV2Input,
	type CustomerBillingControls,
	diffPlanV1,
	FreeTrialDuration,
	type PlanUpdatePreview,
	ResetInterval,
} from "@autumn/shared";
import { getFeatures, TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { expectPreviewVariantsCorrect } from "./utils/expectVariantPreviewCorrect.js";
import { expectVariantProductCorrect } from "./utils/expectVariantProductCorrect.js";
import { readableVariantTestId } from "./utils/readableVariantTestId.js";
import {
	createVariantPlan,
	deleteVariantTestPlans,
} from "./utils/variantTestPlanUtils.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });
const { db, org, env } = ctx;

beforeAll(async () => {
	const desiredFeatures = Object.values(getFeatures({ orgId: org.id }));
	const existingFeatures = await FeatureService.list({
		db,
		orgId: org.id,
		env,
	});
	const existingFeatureIds = new Set(
		existingFeatures.map((feature) => feature.id),
	);
	const missingFeatures = desiredFeatures.filter(
		(feature) => !existingFeatureIds.has(feature.id),
	);

	if (missingFeatures.length > 0) {
		await FeatureService.insert({
			db,
			data: missingFeatures,
			logger: console,
		});
	}

	ctx.features = await FeatureService.list({ db, orgId: org.id, env });
});

const cleanup = async (id: string) => {
	await deleteVariantTestPlans({ rpc: autumnRpc, planIds: [id] });
};

const msgItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const createBase = async (id: string, includedUsage = 100) => {
	await cleanup(id);
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: id,
		name: `Base ${id}`,
		group: `grp_${id}`,
		auto_enable: false,
		items: [msgItem(includedUsage)],
	});
	return await ProductService.getFull({
		db,
		idOrInternalId: id,
		orgId: org.id,
		env,
	});
};

const createVariantRpc = async <T = ApiPlanV1>(
	planId: string,
	variantId: string,
	name: string,
	resetVariant = true,
) =>
	createVariantPlan<T>({
		rpc: autumnRpc,
		basePlanId: planId,
		variantPlanId: variantId,
		name,
		resetVariant,
	});

const previewUpdateRpc = async <T = PlanUpdatePreview>(
	planId: string,
	updates: Record<string, unknown>,
) =>
	autumnRpc.rpc.call<T>({
		method: "/plans.preview_update",
		body: { plan_id: planId, ...updates },
	});

const listPlansRpc = async <T = { list: ApiPlanV1[] }>() =>
	autumnRpc.rpc.call<T>({ method: "/plans.list", body: {} });

const getPlanRpc = async (planId: string) =>
	autumnRpc.plans.get<ApiPlanV1>(planId);

// ─────────────────────────────────────────────────────────────────────────────
// 1. force_version + disable_version both true → 400 conflicting_version_flags
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: force_version + disable_version both true → conflicting_version_flags")}`,
	async () => {
		const id = readableVariantTestId("cc_flags_err");
		await createBase(id);

		await expectAutumnError({
			errCode: "conflicting_version_flags",
			func: async () => {
				await autumnRpc.plans.update<ApiPlanV1>(id, {
					items: [msgItem(200)],
					force_version: true,
					disable_version: true,
				});
			},
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. force_version=true always versions even with no customers
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: force_version=true versions even with no customers")}`,
	async () => {
		const id = readableVariantTestId("cc_force_version");
		const base = await createBase(id);
		expect(base.version).toBe(1);

		await autumnRpc.plans.update<ApiPlanV1>(id, {
			items: [msgItem(500)],
			force_version: true,
		});

		const v2 = await ProductService.getFull({
			db,
			idOrInternalId: id,
			orgId: org.id,
			env,
		});
		expect(v2.version).toBe(2);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. disable_version=true performs in-place edit (no versioning) when customers exist
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: disable_version=true does in-place edit when customers exist")}`,
	async () => {
		const customerId = readableVariantTestId("cc_disable_version");
		const prod = products.base({
			id: "base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [prod] }),
			],
			actions: [s.billing.attach({ productId: "base" })],
		});

		const prefixedId = `base_${customerId}`;

		const before = await ProductService.getFull({
			db,
			idOrInternalId: prefixedId,
			orgId: org.id,
			env,
		});

		await autumnRpc.plans.update<ApiPlanV1>(prefixedId, {
			items: [msgItem(999)],
			disable_version: true,
		});

		const after = await ProductService.getFull({
			db,
			idOrInternalId: prefixedId,
			orgId: org.id,
			env,
		});
		expect(after.version).toBe(before.version);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. base_internal_product_id is set on create_variant
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: base_internal_product_id set on create_variant")}`,
	async () => {
		const baseId = readableVariantTestId("cc_base_link");
		const variantId = `${baseId}_variant`;
		const base = await createBase(baseId);

		await createVariantRpc(baseId, variantId, "Variant 1");

		const variant = await ProductService.getFull({
			db,
			idOrInternalId: variantId,
			orgId: org.id,
			env,
		});
		expectVariantProductCorrect({ base, variant });
	},
);

test.concurrent(
	`${chalk.yellowBright("variants contract: create_variant carries base plan details")}`,
	async () => {
		const baseId = readableVariantTestId("cc_plan_details");
		const variantId = `${baseId}_variant`;
		const billingControls: CustomerBillingControls = {
			usage_limits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 1_000,
					interval: ResetInterval.Month,
				},
			],
		};

		await deleteVariantTestPlans({
			rpc: autumnRpc,
			planIds: [baseId, variantId],
		});
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: baseId,
			name: `Base ${baseId}`,
			description: "Variant source plan",
			group: `grp_${baseId}`,
			add_on: true,
			auto_enable: false,
			config: { ignore_past_due: true },
			billing_controls: billingControls,
			metadata: { source: "variant-contract", tier: 2 },
			free_trial: { duration_length: 7, duration_type: FreeTrialDuration.Day },
			items: [msgItem(100)],
		});

		await createVariantRpc(baseId, variantId, "Variant Details");

		const base = await ProductService.getFull({
			db,
			idOrInternalId: baseId,
			orgId: org.id,
			env,
		});
		const variant = await ProductService.getFull({
			db,
			idOrInternalId: variantId,
			orgId: org.id,
			env,
		});

		expectVariantProductCorrect({
			base,
			variant,
			expectCopiedPlanDetails: true,
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. base_plan_id can relink and detach an existing variant
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: base_plan_id relinks and detaches an existing variant")}`,
	async () => {
		const baseId = readableVariantTestId("cc_mutable_link");
		const nextBaseId = `${baseId}_next`;
		const variantId = `${baseId}_variant`;
		await deleteVariantTestPlans({
			rpc: autumnRpc,
			planIds: [baseId, nextBaseId, variantId],
		});
		const base = await createBase(baseId);
		const nextBase = await createBase(nextBaseId);

		await createVariantRpc(baseId, variantId, "Variant Mutable", false);

		const initialVariant = await ProductService.getFull({
			db,
			idOrInternalId: variantId,
			orgId: org.id,
			env,
		});
		expect(initialVariant.base_internal_product_id).toBe(base.internal_id);

		await autumnRpc.plans.update<ApiPlanV1>(variantId, {
			base_plan_id: nextBaseId,
		});

		const relinked = await ProductService.getFull({
			db,
			idOrInternalId: variantId,
			orgId: org.id,
			env,
		});
		expect(relinked.base_internal_product_id).toBe(nextBase.internal_id);

		const relinkedPlan = await getPlanRpc(variantId);
		expect(relinkedPlan.variant_details?.base_plan_id).toBe(nextBaseId);

		await autumnV1_2.products.update<ApiPlanV1>(variantId, {
			base_plan_id: null,
		});

		const detached = await ProductService.getFull({
			db,
			idOrInternalId: variantId,
			orgId: org.id,
			env,
		});
		expect(detached.base_internal_product_id).toBeNull();

		const detachedPlan = await getPlanRpc(variantId);
		expect(detachedPlan.variant_details).toBeUndefined();
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. create_variant returns standard getPlanResponse shape (ApiPlanV1)
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: create_variant returns ApiPlanV1 shape")}`,
	async () => {
		const baseId = readableVariantTestId("cc_shape");
		const variantId = `${baseId}_variant`;
		await createBase(baseId);

		const variant = await createVariantRpc(baseId, variantId, "Variant Shape");
		ApiPlanV1Schema.parse(variant);
		expect(variant.id).toBe(variantId);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. archived variant silently filtered from propagate
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: archived variant silently filtered from propagate")}`,
	async () => {
		const baseId = readableVariantTestId("cc_archived_filter");
		const variantId = `${baseId}_variant`;
		await createBase(baseId);
		await createVariantRpc(baseId, variantId, "Variant Archived");

		await autumnRpc.plans.update<ApiPlanV1>(variantId, { archived: true });

		const variantBefore = await ProductService.getFull({
			db,
			idOrInternalId: variantId,
			orgId: org.id,
			env,
		});
		const variantVersionBefore = variantBefore.version;

		await autumnRpc.plans.update<ApiPlanV1>(baseId, {
			items: [msgItem(777)],
			update_variant_ids: [variantId],
		});

		const variantAfter = await ProductService.getFull({
			db,
			idOrInternalId: variantId,
			orgId: org.id,
			env,
		});
		expect(variantAfter.version).toBe(variantVersionBefore);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 9. preview_update.versionable matches actual update outcome
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: preview versionable matches actual update outcome")}`,
	async () => {
		const customerId = readableVariantTestId("cc_versionable");
		const prod = products.base({
			id: "base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [prod] }),
			],
			actions: [s.billing.attach({ productId: "base" })],
		});

		const prefixedId = `base_${customerId}`;

		const preview = await previewUpdateRpc(prefixedId, {
			items: [msgItem(422)],
		});

		const beforeUpdate = await ProductService.getFull({
			db,
			idOrInternalId: prefixedId,
			orgId: org.id,
			env,
		});

		await autumnRpc.plans.update<ApiPlanV1>(prefixedId, {
			items: [msgItem(422)],
		});

		const afterUpdate = await ProductService.getFull({
			db,
			idOrInternalId: prefixedId,
			orgId: org.id,
			env,
		});

		if (preview.versionable) {
			expect(afterUpdate.version).toBe(beforeUpdate.version + 1);
			expect(afterUpdate.internal_id).not.toBe(beforeUpdate.internal_id);
		} else {
			expect(afterUpdate.version).toBe(beforeUpdate.version);
		}
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 10. preview_update.diff matches manual diffPlanV1
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: preview diff matches manual diffPlanV1")}`,
	async () => {
		const baseId = readableVariantTestId("cc_manual_diff");
		await createBase(baseId, 100);

		const oldPlan = await getPlanRpc(baseId);

		const preview = await previewUpdateRpc(baseId, {
			items: [msgItem(555)],
		});

		await autumnRpc.plans.update<ApiPlanV1>(baseId, {
			items: [msgItem(555)],
		});

		const newPlan = await getPlanRpc(baseId);
		const manualDiff = diffPlanV1({ from: oldPlan, to: newPlan });

		expect(preview.customize).toEqual(manualDiff);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 11. test.skip — contract #18: throw-on-first-failure (no Stripe injection hook in harness)
// ─────────────────────────────────────────────────────────────────────────────

test.skip(`${chalk.yellowBright("variants contract: throw-on-first-failure (contract #18)")}`, async () => {
	// TODO: contract #18 — updateVariants throws on first failure.
	// Requires a Stripe injection hook to simulate a mid-propagation failure
	// (e.g., variant 2 of 3 throws) so we can assert base update is committed
	// and variants before the throw are done while variants after are not.
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. update_variant_ids:[] identical to omitted
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: update_variant_ids empty array identical to omitted")}`,
	async () => {
		const idA = readableVariantTestId("cc_empty_prop_a");
		const idB = readableVariantTestId("cc_empty_prop_b");
		await createBase(idA, 100);
		await createBase(idB, 100);

		await autumnRpc.plans.update<ApiPlanV1>(idA, {
			items: [msgItem(200)],
			update_variant_ids: [],
		});

		await autumnRpc.plans.update<ApiPlanV1>(idB, {
			items: [msgItem(200)],
		});

		const a = await ProductService.getFull({
			db,
			idOrInternalId: idA,
			orgId: org.id,
			env,
		});
		const b = await ProductService.getFull({
			db,
			idOrInternalId: idB,
			orgId: org.id,
			env,
		});
		expect(a.version).toBe(b.version);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 13. update rejects base's own id in propagate
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: update rejects base's own id in propagate")}`,
	async () => {
		const baseId = readableVariantTestId("cc_self_target");
		await createBase(baseId);

		await expectAutumnError({
			errCode: "invalid_propagation_target",
			func: async () => {
				await autumnRpc.plans.update<ApiPlanV1>(baseId, {
					items: [msgItem(200)],
					update_variant_ids: [baseId],
				});
			},
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 14. update rejects non-existent id in propagate
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: update rejects non-existent id in propagate")}`,
	async () => {
		const baseId = readableVariantTestId("cc_missing_target");
		await createBase(baseId);

		await expectAutumnError({
			errCode: "invalid_propagation_target",
			func: async () => {
				await autumnRpc.plans.update<ApiPlanV1>(baseId, {
					items: [msgItem(200)],
					update_variant_ids: [readableVariantTestId("missing_variant")],
				});
			},
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 15. create_variant rejects id === plan_id (409 product_id_already_exists)
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: create_variant rejects id === plan_id")}`,
	async () => {
		const baseId = readableVariantTestId("cc_collision");
		await createBase(baseId);

		await expectAutumnError({
			errCode: "product_id_already_exists",
			func: async () => {
				await createVariantRpc(baseId, baseId, "Self collision", false);
			},
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 16. create_variant variant appears in plans.list with base_internal_product_id set
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: variant appears in plans.list")}`,
	async () => {
		const baseId = readableVariantTestId("cc_list_variant");
		const variantId = `${baseId}_variant`;
		await createBase(baseId);
		await createVariantRpc(baseId, variantId, "Variant List");
		await autumnRpc.plans.update<ApiPlanV1>(variantId, {
			price: { amount: 120, interval: BillingInterval.Year },
			disable_version: true,
		});

		const { list } = await listPlansRpc();
		const variant = list.find((p) => p.id === variantId);
		expect(variant).toBeDefined();
		expect(variant?.variant_details?.base_plan_id).toBe(baseId);
		expect(variant?.variant_details?.customize?.price).toEqual({
			amount: 120,
			interval: BillingInterval.Year,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("variants contract: plans.list keeps variants linked after base versions")}`,
	async () => {
		const baseId = readableVariantTestId("cc_list_orphan");
		const variantId = `${baseId}_variant`;
		await createBase(baseId);
		await createVariantRpc(baseId, variantId, "Variant Orphan");

		await autumnRpc.plans.update<ApiPlanV1>(baseId, {
			items: [msgItem(250)],
			force_version: true,
		});

		const { list } = await listPlansRpc();
		const variant = list.find((p) => p.id === variantId);
		expect(variant).toBeDefined();
		expect(variant?.variant_details?.base_plan_id).toBe(baseId);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 17. preview_update on base with zero variants → variants: []
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: preview_update with zero variants → variants empty")}`,
	async () => {
		const baseId = readableVariantTestId("cc_zero_variants");
		await createBase(baseId);

		const preview = await previewUpdateRpc(baseId, {
			items: [msgItem(444)],
		});

		expectPreviewVariantsCorrect({ preview, variants: [] });
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 18. free_trial diff propagation overwrites variant override
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: free_trial propagation overwrites variant override")}`,
	async () => {
		const baseId = readableVariantTestId("cc_free_trial");
		const variantId = `${baseId}_variant`;

		await cleanup(baseId);
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: baseId,
			name: `Base FT ${baseId}`,
			group: `grp_${baseId}`,
			auto_enable: false,
			items: [msgItem(100)],
			free_trial: { duration_length: 7, duration_type: FreeTrialDuration.Day },
		});

		await createVariantRpc(baseId, variantId, "Variant FT");

		await autumnRpc.plans.update<ApiPlanV1>(variantId, {
			free_trial: { duration_length: 14, duration_type: FreeTrialDuration.Day },
		});

		const variantBefore = await getPlanRpc(variantId);
		expect(variantBefore.free_trial?.duration_length).toBe(14);

		await autumnRpc.plans.update<ApiPlanV1>(baseId, {
			free_trial: { duration_length: 30, duration_type: FreeTrialDuration.Day },
			update_variant_ids: [variantId],
		});

		const variantAfter = await getPlanRpc(variantId);
		expect(variantAfter.free_trial?.duration_length).toBe(30);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 19. force_version=true versions when no customers exist (standalone assertion)
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("variants contract: force_version versions with no customers (standalone)")}`,
	async () => {
		const id = readableVariantTestId("cc_force_standalone");
		await createBase(id);

		await autumnRpc.plans.update<ApiPlanV1>(id, {
			items: [msgItem(800)],
			force_version: true,
		});

		const updated = await ProductService.getFull({
			db,
			idOrInternalId: id,
			orgId: org.id,
			env,
		});
		expect(updated.version).toBe(2);
		expect(updated.internal_id).not.toBe(
			(
				await ProductService.getFull({
					db,
					idOrInternalId: id,
					orgId: org.id,
					env,
					version: 1,
				})
			).internal_id,
		);
	},
);
