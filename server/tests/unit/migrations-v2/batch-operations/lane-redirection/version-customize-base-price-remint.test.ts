/**
 * Version + customize is customize-on-from plus a product/version repoint.
 * Catalog v2 reminting Autumn price rows (same Stripe/amount) is not a
 * base-price billing change and must not reject the batch lane.
 *
 * Red (current):  v1 vs v2 reminted $20 prices reject as base_price_transition.
 * Green (after):  computable; domains replace + product repoint; no reject.
 */

import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	BillingInterval,
	EntInterval,
	type Entitlement,
	EntitlementSchema,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
	type FullProduct,
	type Price,
	PriceType,
	ResetInterval,
} from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import type { CreatePlanItemParamsV1Input } from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1.js";
import { computeBatchMigration } from "@/internal/migrations/v2/batchOperations/compute/computeBatchMigration.js";
import { hashPlanItemArtifact } from "@/internal/migrations/v2/prepare/modules/ensurePricesAndEntitlements/hashPlanItemArtifact.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import { PREPARE_KEY } from "./runLane.js";

const domainsFeature = {
	internal_id: "feat_domains",
	id: "domains",
	type: FeatureType.Metered,
} as unknown as Feature;

const stripePriceId = "price_1MCYUkJEBzQpmA4Q7sx3pUKR";

const fixedPrice = ({
	id,
	internalProductId,
	amount,
}: {
	id: string;
	internalProductId: string;
	amount: number;
}): Price => ({
	id,
	internal_product_id: internalProductId,
	entitlement_id: null,
	proration_config: null,
	config: {
		type: PriceType.Fixed,
		amount,
		interval: BillingInterval.Month,
		stripe_price_id: stripePriceId,
		feature_id: null,
		internal_feature_id: null,
	},
});

const domainsEntitlement = ({
	id,
	internalProductId,
	allowance,
}: {
	id: string;
	internalProductId: string;
	allowance: number;
}): EntitlementWithFeature => {
	const row: Entitlement = EntitlementSchema.parse({
		id,
		created_at: 0,
		internal_feature_id: domainsFeature.internal_id,
		internal_product_id: internalProductId,
		is_custom: false,
		feature_id: domainsFeature.id,
		allowance_type: AllowanceType.Fixed,
		allowance,
		interval: EntInterval.Month,
		interval_count: 1,
		pooled: false,
	});
	return { ...row, feature: domainsFeature };
};

const planProduct = ({
	internalId,
	version,
	price,
	entitlement,
}: {
	internalId: string;
	version: number;
	price: Price;
	entitlement: EntitlementWithFeature;
}): FullProduct =>
	({
		id: "transactional_pro",
		internal_id: internalId,
		version,
		is_add_on: false,
		prices: [price],
		entitlements: [entitlement],
		licenses: [],
	}) as unknown as FullProduct;

const domainsAddItem: CreatePlanItemParamsV1Input = {
	feature_id: "domains",
	included: 10,
	pooled: false,
	reset: { interval: ResetInterval.Month, interval_count: 1 },
};

const v1Price = fixedPrice({
	id: "pr_3GGJxUKcHJSvuz9ClpZJy4yxjix",
	internalProductId: "prod_tp_v1",
	amount: 20,
});
const v2Price = fixedPrice({
	id: "pr_3IA2xggbEqX7tUYH1thsohElead",
	internalProductId: "prod_tp_v2",
	amount: 20,
});

const v1Product = planProduct({
	internalId: "prod_tp_v1",
	version: 1,
	price: v1Price,
	entitlement: domainsEntitlement({
		id: "ent_domains_v1",
		internalProductId: "prod_tp_v1",
		allowance: 5,
	}),
});
const v2Product = planProduct({
	internalId: "prod_tp_v2",
	version: 2,
	price: v2Price,
	entitlement: domainsEntitlement({
		id: "ent_domains_v2",
		internalProductId: "prod_tp_v2",
		allowance: 5,
	}),
});

const preparedDomains = domainsEntitlement({
	id: "ent_domains_custom",
	internalProductId: "prod_tp_v2",
	allowance: 10,
});

const computeResendShapedOp = ({
	toPrice,
}: {
	toPrice: Price;
}) => {
	const targetProduct = planProduct({
		internalId: "prod_tp_v2",
		version: 2,
		price: toPrice,
		entitlement: v2Product.entitlements[0]!,
	});
	const op = {
		type: "update_plan",
		plan_filter: { plan_id: "transactional_pro", version: 1 },
		version: 2,
		customize: {
			add_items: [domainsAddItem],
			remove_items: [{ feature_id: "domains" }],
		},
	} as UpdatePlanOp;

	return computeBatchMigration({
		migration: {
			id: "mig_resend",
			no_billing_changes: true,
			operations: { customer: [op] },
			prepared_state: {
				[PREPARE_KEY]: {
					entitlements: [preparedDomains],
					prices: [],
					artifacts: [
						{
							op_index: 0,
							kind: "add_item" as const,
							item_index: 0,
							hash: hashPlanItemArtifact({ item: domainsAddItem }),
							internal_product_id: "prod_tp_v2",
							entitlement_id: preparedDomains.id,
						},
					],
				},
			},
		} as MigrationRuntime,
		products: [v1Product, targetProduct],
		features: [domainsFeature],
	});
};

describe("version + customize base-price remint", () => {
	test("same Stripe/amount with reminted Autumn price ids is batch-computable", () => {
		const result = computeResendShapedOp({ toPrice: v2Price });

		expect(result.computable).toBe(true);
		if (!result.computable) throw new Error("expected computable");

		expect(result.plan.patches).toHaveLength(1);
		const operations = result.plan.patches[0]!.operations;
		expect(operations.repointCustomerProduct).toEqual({
			fromInternalProductId: "prod_tp_v1",
			toInternalProductId: "prod_tp_v2",
		});
		expect(
			operations.replaceEntitlements.map(
				(operation) => operation.entitlementPrice.entitlement.id,
			),
		).toEqual(["ent_domains_custom"]);
	});

	test("a real base-price amount change still rejects", () => {
		const result = computeBatchMigration({
			migration: {
				id: "mig_amount",
				no_billing_changes: true,
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: "transactional_pro", version: 1 },
							version: 2,
						} as UpdatePlanOp,
					],
				},
			} as MigrationRuntime,
			products: [
				v1Product,
				planProduct({
					internalId: "prod_tp_v2",
					version: 2,
					price: fixedPrice({
						id: "pr_v2_amount",
						internalProductId: "prod_tp_v2",
						amount: 30,
					}),
					entitlement: v2Product.entitlements[0]!,
				}),
			],
			features: [domainsFeature],
		});

		expect(result.computable).toBe(false);
		if (result.computable) throw new Error("expected rejection");
		expect(result.rejections.map((rejection) => rejection.code)).toContain(
			"base_price_transition",
		);
	});
});
