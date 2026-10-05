import { describe, expect, test } from "bun:test";
import { RolloverExpiryDurationType } from "@autumn/shared";
import {
	type ApplyBillingPlanCommand,
	applyMutation,
	computeApplyBillingPlan,
	createSubjectState,
	toBillingPlanAddRolloversOp,
} from "../../../../src/balanceEngine.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	occurredAt,
} from "../../engineFixtures.js";

const grantId = "messages_monthly";
const carried = {
	id: "roll_new",
	cus_ent_id: grantId,
	balance: 30,
	usage: 0,
	expires_at: occurredAt + 1000,
	entities: {},
};

const stateHolding = ({ oldBalance }: { oldBalance: number }) =>
	createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [createCustomerEntitlement({ id: grantId })],
		rollovers: [
			{
				id: "roll_old",
				cus_ent_id: grantId,
				balance: oldBalance,
				usage: 0,
				expires_at: occurredAt + 500,
				entities: {},
			},
		],
	});

const addRolloversPlan = (): ApplyBillingPlanCommand => ({
	schemaVersion: 1,
	type: "applyBillingPlan",
	commandId: "plan_add_rollovers",
	requestId: "req_plan_add_rollovers",
	identity,
	occurredAt,
	entityIds: [],
	ops: toBillingPlanAddRolloversOp({ id: grantId, rows: [carried] }),
	expiringPooledBalanceIds: [],
});

const catalogWithCap = ({
	state,
	max,
}: {
	state: ReturnType<typeof stateHolding>;
	max: number | null;
}) => {
	const catalog = createCatalogFor({ state });
	const entitlement = catalog.entitlements[`ent_${grantId}`];
	if (!entitlement) throw new Error("expected the fixture entitlement");
	entitlement.rollover = {
		max,
		duration: RolloverExpiryDurationType.Month,
		length: 1,
	};
	return catalog;
};

describe("a plan's new rollovers", () => {
	test("land as inserts, capped against the grant's own rollovers the way a reset's are", () => {
		const state = stateHolding({ oldBalance: 40 });
		const mutation = computeApplyBillingPlan({
			command: addRolloversPlan(),
			state,
			catalog: catalogWithCap({ state, max: 50 }),
		});
		const after = applyMutation({ state, mutation });
		// 40 + 30 = 70 against a cap of 50: the oldest gives up 20, the new row keeps its 30.
		expect(after.rollovers.map(({ id, balance }) => ({ id, balance }))).toEqual(
			[
				{ id: "roll_old", balance: 20 },
				{ id: "roll_new", balance: 30 },
			],
		);
		expect(
			mutation.changes.filter((change) => change.table === "rollovers"),
		).toMatchObject([
			{ op: "insert", row: { id: "roll_new", balance: 30 } },
			{
				op: "update",
				id: "roll_old",
				before: { balance: 40 },
				after: { balance: 20 },
			},
		]);
	});

	test("an uncapped grant keeps every row", () => {
		const state = stateHolding({ oldBalance: 40 });
		const mutation = computeApplyBillingPlan({
			command: addRolloversPlan(),
			state,
			catalog: catalogWithCap({ state, max: null }),
		});
		expect(
			applyMutation({ state, mutation }).rollovers.map(
				({ balance }) => balance,
			),
		).toEqual([40, 30]);
	});

	test("no rows is no op", () => {
		expect(toBillingPlanAddRolloversOp({ id: grantId, rows: [] })).toEqual([]);
	});
});
