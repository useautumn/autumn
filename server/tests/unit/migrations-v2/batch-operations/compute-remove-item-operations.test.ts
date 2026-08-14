import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
	type FullProduct,
	type Price,
	ResetInterval,
} from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { computePatchProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computePatchProductTransitions.js";
import { checkUpdatePlanOpEligibility } from "@/internal/migrations/v2/batchOperations/compute/guards/checkUpdatePlanOpEligibility.js";
import { checkUpdatePlanTransitionEligibility } from "@/internal/migrations/v2/batchOperations/compute/guards/checkUpdatePlanTransitionEligibility.js";
import { computeBatchMigrationOperations } from "@/internal/migrations/v2/batchOperations/compute/operations/computeBatchMigrationOperations.js";
import { resolveRemoveItemEntitlements } from "@/internal/migrations/v2/batchOperations/compute/utils/resolveRemoveItemEntitlements.js";

const messagesFeature = {
	internal_id: "feat_messages",
	id: "messages",
	type: FeatureType.Metered,
} as unknown as Feature;

const messagesEnt = ({
	id = "ent_messages",
	interval = EntInterval.Month,
	intervalCount = 1,
	rollover = null,
	entityFeatureId = null,
	pooled = false,
}: {
	id?: string;
	interval?: EntInterval | null;
	intervalCount?: number;
	rollover?: unknown;
	entityFeatureId?: string | null;
	pooled?: boolean;
} = {}): EntitlementWithFeature =>
	({
		id,
		created_at: 0,
		internal_product_id: "prod_pro",
		internal_feature_id: messagesFeature.internal_id,
		feature_id: messagesFeature.id,
		allowance_type: AllowanceType.Fixed,
		allowance: 100,
		interval,
		interval_count: intervalCount,
		rollover,
		entity_feature_id: entityFeatureId,
		pooled,
		feature: messagesFeature,
	}) as unknown as EntitlementWithFeature;

const proProduct = ({
	entitlements,
	prices = [],
}: {
	entitlements: EntitlementWithFeature[];
	prices?: Price[];
}): FullProduct =>
	({
		id: "pro",
		internal_id: "prod_pro",
		entitlements,
		prices,
		licenses: [],
	}) as unknown as FullProduct;

const removeOp = (removeItems: unknown[]): UpdatePlanOp =>
	({
		type: "update_plan",
		plan_filter: { plan_id: "pro" },
		customize: { remove_items: removeItems },
	}) as unknown as UpdatePlanOp;

const lower = ({
	fromProduct,
	op,
}: {
	fromProduct: FullProduct;
	op: UpdatePlanOp;
}) => {
	const removeEntitlementIds = resolveRemoveItemEntitlements({
		op,
		fromProduct,
	});
	const productTransitions = computePatchProductTransitions({
		fromProduct,
		addEntitlements: [],
		removeEntitlementIds,
	});
	const operations = computeBatchMigrationOperations({
		productTransitions,
		licenseLinks: [],
	});
	const rejections = checkUpdatePlanTransitionEligibility({
		opIndex: 0,
		fromProduct,
		productTransitions,
		licenseLinks: [],
		operations: operations.entitlements,
	});
	return { operations, rejections };
};

describe("plain plan item removal lowering", () => {
	test("a free standalone removal lowers to a remove op", () => {
		const { operations, rejections } = lower({
			fromProduct: proProduct({ entitlements: [messagesEnt()] }),
			op: removeOp([{ feature_id: "messages" }]),
		});

		expect(rejections).toHaveLength(0);
		expect(operations.removeEntitlements).toHaveLength(1);
		expect(
			operations.removeEntitlements[0]?.entitlementPrice.entitlement.id,
		).toBe("ent_messages");
		expect(operations.entitlements).toHaveLength(0);
	});

	test("a priced removal is rejected", () => {
		const entitlement = messagesEnt();
		const price = {
			id: "price_messages",
			entitlement_id: entitlement.id,
			internal_product_id: "prod_pro",
			config: {},
		} as unknown as Price;

		const { rejections } = lower({
			fromProduct: proProduct({
				entitlements: [entitlement],
				prices: [price],
			}),
			op: removeOp([{ feature_id: "messages" }]),
		});

		expect(rejections.map((rejection) => rejection.code)).toContain(
			"priced_remove_item",
		);
	});

	test("a rollover removal is rejected", () => {
		const { rejections } = lower({
			fromProduct: proProduct({
				entitlements: [messagesEnt({ rollover: { max: 100 } })],
			}),
			op: removeOp([{ feature_id: "messages" }]),
		});

		expect(rejections.map((rejection) => rejection.code)).toContain(
			"rollover_remove_item",
		);
	});

	test("an entity-scoped removal is rejected", () => {
		const { rejections } = lower({
			fromProduct: proProduct({
				entitlements: [messagesEnt({ entityFeatureId: "feat_seats" })],
			}),
			op: removeOp([{ feature_id: "messages" }]),
		});

		expect(rejections.map((rejection) => rejection.code)).toContain(
			"entity_scoped_entitlement",
		);
	});

	test("a pooled removal is rejected", () => {
		const { rejections } = lower({
			fromProduct: proProduct({
				entitlements: [messagesEnt({ pooled: true })],
			}),
			op: removeOp([{ feature_id: "messages" }]),
		});

		expect(rejections.map((rejection) => rejection.code)).toContain(
			"pooled_add_item",
		);
	});

	test("a one_off filter matches a lifetime entitlement", () => {
		const { operations, rejections } = lower({
			fromProduct: proProduct({
				entitlements: [messagesEnt({ id: "ent_lifetime", interval: null })],
			}),
			op: removeOp([
				{ feature_id: "messages", interval: ResetInterval.OneOff },
			]),
		});

		expect(rejections).toHaveLength(0);
		expect(
			operations.removeEntitlements.map(
				(operation) => operation.entitlementPrice.entitlement.id,
			),
		).toEqual(["ent_lifetime"]);
	});

	test("an interval_count filter alone does not widen to other cadences", () => {
		const monthly = messagesEnt({ id: "ent_monthly" });
		const quarterly = messagesEnt({ id: "ent_quarterly", intervalCount: 3 });

		const { operations } = lower({
			fromProduct: proProduct({ entitlements: [monthly, quarterly] }),
			op: removeOp([{ feature_id: "messages", interval_count: 3 }]),
		});

		expect(
			operations.removeEntitlements.map(
				(operation) => operation.entitlementPrice.entitlement.id,
			),
		).toEqual(["ent_quarterly"]);
	});

	test("removing one of two same-feature siblings does not claim the survivor", () => {
		const monthly = messagesEnt({ id: "ent_monthly" });
		const quarterly = messagesEnt({ id: "ent_quarterly", intervalCount: 3 });

		const { operations, rejections } = lower({
			fromProduct: proProduct({ entitlements: [monthly, quarterly] }),
			op: removeOp([
				{
					feature_id: "messages",
					interval: ResetInterval.Month,
					interval_count: 1,
				},
			]),
		});

		expect(rejections).toHaveLength(0);
		expect(
			operations.removeEntitlements.map(
				(operation) => operation.entitlementPrice.entitlement.id,
			),
		).toEqual(["ent_monthly"]);
	});

	test("a feature-less filter is rejected rather than silently matching none", () => {
		const rejections = checkUpdatePlanOpEligibility({
			op: removeOp([{ interval: ResetInterval.Month }]),
			opIndex: 0,
		});

		expect(rejections.map((rejection) => rejection.code)).toContain(
			"unsupported_remove_items",
		);
	});

	test("an interval filter narrows to the matching cadence", () => {
		const monthly = messagesEnt({ id: "ent_monthly" });
		const quarterly = messagesEnt({ id: "ent_quarterly", intervalCount: 3 });

		const { operations, rejections } = lower({
			fromProduct: proProduct({ entitlements: [monthly, quarterly] }),
			op: removeOp([
				{
					feature_id: "messages",
					interval: EntInterval.Month,
					interval_count: 3,
				},
			]),
		});

		expect(rejections).toHaveLength(0);
		expect(
			operations.removeEntitlements.map(
				(operation) => operation.entitlementPrice.entitlement.id,
			),
		).toEqual(["ent_quarterly"]);
	});

	test("a modify-in-place pair is rejected op-level, not silently dropped", () => {
		const op = {
			type: "update_plan",
			plan_filter: { plan_id: "pro" },
			customize: {
				add_items: [{ feature_id: "messages", included: 200 }],
				remove_items: [{ feature_id: "messages" }],
			},
		} as unknown as UpdatePlanOp;

		const rejections = checkUpdatePlanOpEligibility({ op, opIndex: 0 });

		expect(rejections.map((rejection) => rejection.code)).toContain(
			"unsupported_remove_items",
		);
	});

	test("a standalone remove passes the op guard", () => {
		const rejections = checkUpdatePlanOpEligibility({
			op: removeOp([{ feature_id: "messages" }]),
			opIndex: 0,
		});

		expect(rejections).toHaveLength(0);
	});

	test("a billing_method filter is rejected", () => {
		const rejections = checkUpdatePlanOpEligibility({
			op: removeOp([{ feature_id: "messages", billing_method: "prepaid" }]),
			opIndex: 0,
		});

		expect(rejections.map((rejection) => rejection.code)).toContain(
			"unsupported_remove_items",
		);
	});
});
