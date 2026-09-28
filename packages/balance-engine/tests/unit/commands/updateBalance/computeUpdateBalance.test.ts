import { describe, expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import {
	computeUpdateBalance,
	createSubjectState,
	type SubjectState,
	subjectStateToFullSubject,
	UnsupportedCommandError,
	type WorkerCustomerEntitlement,
} from "../../../../src/balanceEngine.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createUpdateBalanceCommand,
	identity,
	occurredAt,
} from "../../engineFixtures.js";

const stateWith = ({
	customerEntitlements,
	rollovers = [],
}: {
	customerEntitlements: WorkerCustomerEntitlement[];
	rollovers?: SubjectState["rollovers"];
}): SubjectState =>
	createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements,
		rollovers,
	});

const update = ({
	state,
	command,
	invoiceCredit = false,
}: {
	state: SubjectState;
	command: ReturnType<typeof createUpdateBalanceCommand>;
	invoiceCredit?: boolean;
}) => {
	const catalog = createCatalogFor({ state });
	const feature = catalog.features.feat_messages;
	if (!feature) throw new Error("fixture feature missing");
	if (invoiceCredit) {
		feature.type = FeatureType.CreditSystem;
		feature.config = { schema: [], invoice_credit: true };
	}
	return computeUpdateBalance({
		fullSubject: subjectStateToFullSubject({ state, catalog }),
		command,
	});
};

/** Each row's balance once the mutation's increments land. */
const balanceChangesOf = (mutation: ReturnType<typeof computeUpdateBalance>) =>
	(mutation?.changes ?? []).map((change) =>
		change.op === "increment" ? [change.id, change.add] : change,
	);

const twoRows = [
	createCustomerEntitlement({ id: "a", balance: 10 }),
	{
		...createCustomerEntitlement({ id: "b", balance: 5 }),
		external_id: "topup",
		created_at: occurredAt + 1,
	},
];

describe("updateBalance: remaining", () => {
	test("sets one row down to the target", () => {
		const mutation = update({
			state: stateWith({
				customerEntitlements: [createCustomerEntitlement({ balance: 100 })],
			}),
			command: createUpdateBalanceCommand({ remaining: 40 }),
		});

		expect(balanceChangesOf(mutation)).toEqual([
			["messages_monthly", { balance: -60 }],
		]);
		expect(mutation?.result).toMatchObject({ type: "updateBalance" });
	});

	test("sets up past the grant: no refund ceiling", () => {
		const mutation = update({
			state: stateWith({
				customerEntitlements: [createCustomerEntitlement({ balance: 100 })],
			}),
			command: createUpdateBalanceCommand({ remaining: 150 }),
		});

		expect(balanceChangesOf(mutation)).toEqual([
			["messages_monthly", { balance: 50 }],
		]);
	});

	test("sets below zero without usage_allowed: no floor", () => {
		const mutation = update({
			state: stateWith({
				customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
			}),
			command: createUpdateBalanceCommand({ remaining: -20 }),
		});

		expect(balanceChangesOf(mutation)).toEqual([
			["messages_monthly", { balance: -30 }],
		]);
	});

	test("a lower target is taken from the rows in draw order", () => {
		const mutation = update({
			state: stateWith({ customerEntitlements: twoRows }),
			command: createUpdateBalanceCommand({ remaining: 3 }),
		});

		expect(balanceChangesOf(mutation)).toEqual([
			["a", { balance: -10 }],
			["b", { balance: -2 }],
		]);
	});

	test("a balance id or customer entitlement id sets only that row", () => {
		for (const customerEntitlementFilters of [
			{ balanceId: "topup" },
			{ cusEntIds: ["b"] },
		]) {
			const mutation = update({
				state: stateWith({ customerEntitlements: twoRows }),
				command: createUpdateBalanceCommand({
					remaining: 1,
					customerEntitlementFilters,
				}),
			});

			expect(balanceChangesOf(mutation)).toEqual([["b", { balance: -4 }]]);
		}
	});

	test("rollovers are left out of the sum but drawn first", () => {
		const mutation = update({
			state: stateWith({
				customerEntitlements: [createCustomerEntitlement({ balance: 100 })],
				rollovers: [
					{
						id: "ro_1",
						cus_ent_id: "messages_monthly",
						balance: 20,
						usage: 0,
						expires_at: null,
						entities: {},
					},
				],
			}),
			command: createUpdateBalanceCommand({ remaining: 70 }),
		});

		expect(balanceChangesOf(mutation)).toEqual([
			["messages_monthly", { balance: -10 }],
			["ro_1", { balance: -20, usage: 20 }],
		]);
	});

	test("a target the rows already hold writes nothing", () => {
		expect(
			update({
				state: stateWith({ customerEntitlements: twoRows }),
				command: createUpdateBalanceCommand({ remaining: 15 }),
			}),
		).toBeNull();
	});
});

describe("updateBalance: refusals", () => {
	test("no row for the feature, or a filter that matches none, is balance_not_found", () => {
		const cases = [
			createUpdateBalanceCommand({ featureId: "credits", remaining: 1 }),
			createUpdateBalanceCommand({
				remaining: 1,
				customerEntitlementFilters: { balanceId: "typo" },
			}),
		];
		for (const command of cases) {
			expect(() =>
				update({
					state: stateWith({ customerEntitlements: twoRows }),
					command,
				}),
			).toThrow(new UnsupportedCommandError({ reason: "balance_not_found" }));
		}
	});

	test("an invoice credit balance is not mutable", () => {
		expect(() =>
			update({
				state: stateWith({ customerEntitlements: twoRows }),
				command: createUpdateBalanceCommand({ remaining: 1 }),
				invoiceCredit: true,
			}),
		).toThrow(
			new UnsupportedCommandError({ reason: "invoice_credit_not_mutable" }),
		);
	});
});
