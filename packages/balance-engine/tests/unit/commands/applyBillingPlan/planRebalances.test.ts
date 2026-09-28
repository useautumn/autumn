import { describe, expect, test } from "bun:test";
import {
	type ApplyBillingPlanCommand,
	computeApplyBillingPlan,
	createSubjectState,
	mergeCustomerAndEntities,
	type RowChange,
	type WorkerCustomerEntitlement,
} from "../../../../src/balanceEngine.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createState,
	entity,
	identity,
	occurredAt,
} from "../../engineFixtures.js";

const entityProduct = {
	...createCustomerProduct({ id: "cp_ent_42" }),
	internal_entity_id: entity.internal_id,
};

const messagesRow = ({
	id,
	balance,
	customerProductId,
	usageAllowed = false,
}: {
	id: string;
	balance: number;
	customerProductId: string;
	usageAllowed?: boolean;
}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id, balance }),
	customer_product_id: customerProductId,
	usage_allowed: usageAllowed,
});

/** A customer row in overage, and an entity plan with its own row in overage and the purchased row. */
const planState = () => {
	const customer = createState({
		customerEntitlements: [
			messagesRow({
				id: "customer_overage",
				balance: -50,
				customerProductId: "cp_1",
				usageAllowed: true,
			}),
		],
	});
	const entityPart = createSubjectState({
		identity: { ...identity, entityId: entity.id },
		entity,
		customerProducts: [entityProduct],
		customerEntitlements: [
			messagesRow({
				id: "entity_overage",
				balance: -100,
				customerProductId: entityProduct.id,
				usageAllowed: true,
			}),
			messagesRow({
				id: "entity_purchased",
				balance: 0,
				customerProductId: entityProduct.id,
			}),
		],
	});
	return mergeCustomerAndEntities({ customer, entities: [entityPart] });
};

const rebalancePlan = ({
	purchasedId,
	quantity,
}: {
	purchasedId: string;
	quantity: number;
}): ApplyBillingPlanCommand => ({
	schemaVersion: 1,
	type: "applyBillingPlan",
	commandId: "plan_rebalance",
	requestId: "req_plan_rebalance",
	identity,
	occurredAt,
	entityIds: [entity.id],
	ops: [
		{
			op: "rebalance",
			table: "customerEntitlements",
			id: purchasedId,
			featureId: "messages",
			quantity,
			creditedId: purchasedId,
		},
	],
	expiringPooledBalanceIds: [],
});

/** Each entitlement increment's balance move, by row id; a mutation's changes are read-only and mixed. */
const balanceIncrementsOf = (changes: readonly RowChange[]) =>
	Object.fromEntries(
		changes.flatMap((change) =>
			change.op === "increment" && change.table === "customerEntitlements"
				? [[change.id, change.add.balance]]
				: [],
		),
	);

describe("a plan's rebalance", () => {
	test("an entity's purchase pays down only that entity's overage, then credits the rest", () => {
		const state = planState();
		const mutation = computeApplyBillingPlan({
			command: rebalancePlan({
				purchasedId: "entity_purchased",
				quantity: 300,
			}),
			state,
			entities: [entity],
			catalog: createCatalogFor({ state }),
		});
		expect(balanceIncrementsOf(mutation.changes)).toEqual({
			entity_overage: 100,
			entity_purchased: 200,
		});
	});

	test("a customer's purchase pays down only the customer's overage", () => {
		const base = planState();
		const state = {
			...base,
			customerEntitlements: [
				...base.customerEntitlements,
				messagesRow({
					id: "customer_purchased",
					balance: 0,
					customerProductId: "cp_1",
				}),
			],
		};
		const mutation = computeApplyBillingPlan({
			command: rebalancePlan({
				purchasedId: "customer_purchased",
				quantity: 300,
			}),
			state,
			entities: [entity],
			catalog: createCatalogFor({ state }),
		});
		expect(balanceIncrementsOf(mutation.changes)).toEqual({
			customer_overage: 50,
			customer_purchased: 250,
		});
	});
});
