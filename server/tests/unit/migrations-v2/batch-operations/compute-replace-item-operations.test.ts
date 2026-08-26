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
import { computeProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions.js";
import { checkUpdatePlanTransitionEligibility } from "@/internal/migrations/v2/batchOperations/compute/guards/checkUpdatePlanTransitionEligibility.js";
import { computeBatchMigrationOperations } from "@/internal/migrations/v2/batchOperations/compute/operations/computeBatchMigrationOperations.js";
import { resolveTargetFullProduct } from "@/internal/migrations/v2/batchOperations/compute/transitions/resolveTargetFullProduct.js";
import { hashPlanItemArtifact } from "@/internal/migrations/v2/prepare/modules/ensurePricesAndEntitlements/hashPlanItemArtifact.js";
import { buildPrepareModuleKey } from "@/internal/migrations/v2/prepare/utils/index.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";

const messagesFeature = {
	internal_id: "feat_messages",
	id: "messages",
	type: FeatureType.Metered,
} as unknown as Feature;

const messagesEnt = ({
	id = "ent_messages",
	interval = EntInterval.Month,
	intervalCount = 1,
	allowance = 100,
	allowanceType = AllowanceType.Fixed,
	rollover = null,
	entityFeatureId = null,
	pooled = false,
}: {
	id?: string;
	interval?: EntInterval | null;
	intervalCount?: number;
	allowance?: number;
	allowanceType?: AllowanceType;
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
		allowance_type: allowanceType,
		allowance,
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

const messagesPrice = ({ entitlementId }: { entitlementId: string }): Price =>
	({
		id: `price_${entitlementId}`,
		entitlement_id: entitlementId,
		internal_product_id: "prod_pro",
		config: {},
	}) as unknown as Price;

const editOp = ({
	removeItems = [{ feature_id: "messages" }],
}: {
	removeItems?: unknown[];
} = {}): UpdatePlanOp =>
	({
		type: "update_plan",
		plan_filter: { plan_id: "pro" },
		customize: {
			add_items: [{ feature_id: "messages" }],
			remove_items: removeItems,
		},
	}) as unknown as UpdatePlanOp;

const preparedAddsKey = buildPrepareModuleKey({
	kind: "ensure_prices_and_entitlements",
	parts: ["update_plan"],
});

/** Mirrors prepare's artifact addressing so injected minted rows resolve
 * through the real prepared-state path. */
const migrationWithPreparedAdds = ({
	op,
	addEntitlements,
}: {
	op: UpdatePlanOp;
	addEntitlements: EntitlementWithFeature[];
}): MigrationRuntime =>
	({
		prepared_state: {
			[preparedAddsKey]: {
				entitlements: addEntitlements,
				prices: [],
				artifacts: (op.customize?.add_items ?? []).map((item, itemIndex) => ({
					op_index: 0,
					kind: "add_item",
					item_index: itemIndex,
					hash: hashPlanItemArtifact({ item }),
					internal_product_id: "prod_pro",
					entitlement_id: addEntitlements[itemIndex]?.id,
				})),
			},
		},
	}) as unknown as MigrationRuntime;

const lower = ({
	fromProduct,
	op,
	addEntitlements,
}: {
	fromProduct: FullProduct;
	op: UpdatePlanOp;
	addEntitlements: EntitlementWithFeature[];
}) => {
	const { toProduct } = resolveTargetFullProduct({
		migration: migrationWithPreparedAdds({ op, addEntitlements }),
		op,
		opIndex: 0,
		fromProduct,
		targetProduct: fromProduct,
		features: [messagesFeature],
	});
	if (!toProduct) throw new Error("resolveTargetFullProduct rejected");
	const productTransitions = computeProductTransitions({
		fromProduct,
		toProduct,
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
		operations: operations.addEntitlements,
	});
	return { productTransitions, operations, rejections };
};

describe("plain plan item replace lowering", () => {
	test("a free allowance edit lowers to a replace op carrying the balance", () => {
		const minted = messagesEnt({ id: "ent_messages_new", allowance: 200 });
		const { operations, rejections } = lower({
			fromProduct: proProduct({ entitlements: [messagesEnt()] }),
			op: editOp(),
			addEntitlements: [minted],
		});

		expect(rejections).toHaveLength(0);
		expect(operations.replaceEntitlements).toHaveLength(1);
		const replace = operations.replaceEntitlements[0]!;
		expect(replace.by).toBe("definition");
		if (replace.by !== "definition") return;
		expect(replace.fromEntitlementPrice.entitlement.id).toBe("ent_messages");
		expect(replace.entitlementPrice.entitlement.id).toBe("ent_messages_new");
		expect(replace.initialState.granted).toBe(200);
		expect(operations.addEntitlements).toHaveLength(0);
		expect(operations.removeEntitlements).toHaveLength(0);
	});

	test("lowering an allowance is also a replace, not a remove plus add", () => {
		const minted = messagesEnt({ id: "ent_messages_new", allowance: 50 });
		const { operations, rejections } = lower({
			fromProduct: proProduct({ entitlements: [messagesEnt()] }),
			op: editOp(),
			addEntitlements: [minted],
		});

		expect(rejections).toHaveLength(0);
		expect(operations.replaceEntitlements).toHaveLength(1);
		expect(operations.replaceEntitlements[0]?.initialState.granted).toBe(50);
	});

	test("a metered-to-unlimited edit lowers to a replace op", () => {
		const minted = messagesEnt({
			id: "ent_messages_new",
			allowanceType: AllowanceType.Unlimited,
		});
		const { operations, rejections } = lower({
			fromProduct: proProduct({ entitlements: [messagesEnt()] }),
			op: editOp(),
			addEntitlements: [minted],
		});

		expect(rejections).toHaveLength(0);
		expect(operations.replaceEntitlements).toHaveLength(1);
		expect(operations.replaceEntitlements[0]?.initialState.unlimited).toBe(
			true,
		);
	});

	test("an edit next to a same-feature sibling replaces the edited cadence only", () => {
		const monthly = messagesEnt({ id: "ent_monthly" });
		const quarterly = messagesEnt({ id: "ent_quarterly", intervalCount: 3 });
		const minted = messagesEnt({ id: "ent_monthly_new", allowance: 200 });

		const { operations, rejections } = lower({
			fromProduct: proProduct({ entitlements: [monthly, quarterly] }),
			op: editOp({
				removeItems: [
					{
						feature_id: "messages",
						interval: ResetInterval.Month,
						interval_count: 1,
					},
				],
			}),
			addEntitlements: [minted],
		});

		expect(rejections).toHaveLength(0);
		expect(operations.replaceEntitlements).toHaveLength(1);
		expect(
			operations.replaceEntitlements[0]?.by === "definition"
				? operations.replaceEntitlements[0].fromEntitlementPrice.entitlement.id
				: undefined,
		).toBe("ent_monthly");
		expect(operations.removeEntitlements).toHaveLength(0);
		expect(operations.addEntitlements).toHaveLength(0);
	});

	test("the surviving sibling is not claimed even when it sits after the removed one", () => {
		const monthly = messagesEnt({ id: "ent_monthly" });
		const quarterly = messagesEnt({ id: "ent_quarterly", intervalCount: 3 });

		const { operations, rejections } = lower({
			fromProduct: proProduct({ entitlements: [monthly, quarterly] }),
			op: {
				type: "update_plan",
				plan_filter: { plan_id: "pro" },
				customize: {
					remove_items: [
						{
							feature_id: "messages",
							interval: ResetInterval.Month,
							interval_count: 1,
						},
					],
				},
			} as unknown as UpdatePlanOp,
			addEntitlements: [],
		});

		expect(rejections).toHaveLength(0);
		expect(operations.replaceEntitlements).toHaveLength(0);
		expect(
			operations.removeEntitlements.flatMap((operation) =>
				operation.by === "definition"
					? [operation.entitlementPrice.entitlement.id]
					: [],
			),
		).toEqual(["ent_monthly"]);
	});

	test("a priced from-item transition is rejected", () => {
		const entitlement = messagesEnt();
		const minted = messagesEnt({ id: "ent_messages_new", allowance: 200 });

		const { rejections } = lower({
			fromProduct: proProduct({
				entitlements: [entitlement],
				prices: [messagesPrice({ entitlementId: entitlement.id })],
			}),
			op: editOp(),
			addEntitlements: [minted],
		});

		expect(rejections.map((rejection) => rejection.code)).toContain(
			"paid_entitlement_transition",
		);
	});

	test("a rollover item edit is rejected on either side", () => {
		const fromRollover = lower({
			fromProduct: proProduct({
				entitlements: [messagesEnt({ rollover: { max: 100 } })],
			}),
			op: editOp(),
			addEntitlements: [messagesEnt({ id: "ent_new", allowance: 200 })],
		});
		expect(fromRollover.rejections.map((r) => r.code)).toContain(
			"rollover_remove_item",
		);

		const toRollover = lower({
			fromProduct: proProduct({ entitlements: [messagesEnt()] }),
			op: editOp(),
			addEntitlements: [
				messagesEnt({
					id: "ent_new",
					allowance: 200,
					rollover: { max: 100, length: 1 },
				}),
			],
		});
		expect(toRollover.rejections.map((r) => r.code)).toContain(
			"rollover_remove_item",
		);
	});

	test("an entity-scoped item edit is rejected on either side", () => {
		const fromScoped = lower({
			fromProduct: proProduct({
				entitlements: [messagesEnt({ entityFeatureId: "feat_seats" })],
			}),
			op: editOp(),
			addEntitlements: [messagesEnt({ id: "ent_new", allowance: 200 })],
		});
		expect(fromScoped.rejections.map((r) => r.code)).toContain(
			"entity_scoped_entitlement",
		);

		const toScoped = lower({
			fromProduct: proProduct({ entitlements: [messagesEnt()] }),
			op: editOp(),
			addEntitlements: [
				messagesEnt({
					id: "ent_new",
					allowance: 200,
					entityFeatureId: "feat_seats",
				}),
			],
		});
		expect(toScoped.rejections.map((r) => r.code)).toContain(
			"entity_scoped_entitlement",
		);
	});

	test("a pooled item edit is rejected on either side", () => {
		const fromPooled = lower({
			fromProduct: proProduct({
				entitlements: [messagesEnt({ pooled: true })],
			}),
			op: editOp(),
			addEntitlements: [messagesEnt({ id: "ent_new", allowance: 200 })],
		});
		expect(fromPooled.rejections.map((r) => r.code)).toContain(
			"pooled_add_item",
		);

		const toPooled = lower({
			fromProduct: proProduct({ entitlements: [messagesEnt()] }),
			op: editOp(),
			addEntitlements: [
				messagesEnt({ id: "ent_new", allowance: 200, pooled: true }),
			],
		});
		expect(toPooled.rejections.map((r) => r.code)).toContain("pooled_add_item");
	});

	test("a remove with an unrelated-cadence add still deletes rather than replacing a survivor", () => {
		// Remove monthly and add a NEW quarterly next to an existing quarterly:
		// the existing quarterly must claim itself, monthly transitions to the
		// minted row only if unclaimed — here the minted row IS monthly's match.
		const monthly = messagesEnt({ id: "ent_monthly" });
		const minted = messagesEnt({
			id: "ent_quarterly_new",
			intervalCount: 3,
			allowance: 200,
		});

		const { operations, rejections } = lower({
			fromProduct: proProduct({ entitlements: [monthly] }),
			op: editOp(),
			addEntitlements: [minted],
		});

		// A cadence change is still a transition — same rule as batchTransition.
		expect(rejections).toHaveLength(0);
		expect(operations.replaceEntitlements).toHaveLength(1);
		expect(
			operations.replaceEntitlements[0]?.entitlementPrice.entitlement.id,
		).toBe("ent_quarterly_new");
	});
});
