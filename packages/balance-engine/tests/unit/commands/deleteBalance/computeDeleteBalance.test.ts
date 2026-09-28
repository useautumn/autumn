import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeDeleteBalance,
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
	createDeleteBalanceCommand,
	entity,
	identity,
	occurredAt,
} from "../../engineFixtures.js";

// Mirrors server/tests/integration/balances/delete/delete-balance.test.ts.

const GRANT = 100;

const row = ({
	id,
	balance,
	usageAllowed = false,
	createdAt = occurredAt,
	loose = false,
	externalId = null,
	nextResetAt = occurredAt + 1_000,
}: {
	id: string;
	balance: number;
	usageAllowed?: boolean;
	createdAt?: number;
	loose?: boolean;
	externalId?: string | null;
	nextResetAt?: number | null;
}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id, balance }),
	customer_product_id: loose ? null : "cp_1",
	usage_allowed: usageAllowed,
	created_at: createdAt,
	external_id: externalId,
	next_reset_at: nextResetAt,
	reset_cycle_anchor: nextResetAt === null ? null : occurredAt,
});

const deleteFrom = ({
	customerEntitlements,
	command = createDeleteBalanceCommand(),
	perEntity = false,
	rollovers = [],
}: {
	customerEntitlements: WorkerCustomerEntitlement[];
	command?: ReturnType<typeof createDeleteBalanceCommand>;
	perEntity?: boolean;
	rollovers?: SubjectState["rollovers"];
}) => {
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements,
		rollovers,
	});
	const catalog = createCatalogFor({ state });
	for (const entitlement of Object.values(catalog.entitlements)) {
		entitlement.allowance = GRANT;
		if (perEntity) entitlement.entity_feature_id = "seats";
	}
	const mutation = computeDeleteBalance({
		fullSubject: subjectStateToFullSubject({ state, catalog }),
		command,
	});
	return { mutation, after: applyMutation({ state, mutation }) };
};

const rowOf = ({ state, id }: { state: SubjectState; id: string }) =>
	state.customerEntitlements.find((candidate) => candidate.id === id);
const idsOf = (state: SubjectState) =>
	state.customerEntitlements.map(({ id }) => id);

describe("deleteBalance: plain delete", () => {
	test("a balance id deletes only that grant, with its rollovers (1, 2)", () => {
		const { after } = deleteFrom({
			customerEntitlements: [
				row({ id: "a", balance: 100, loose: true, externalId: "balance-a" }),
				row({ id: "b", balance: 200, loose: true, externalId: "balance-b" }),
			],
			rollovers: [
				{
					id: "ro_a",
					cus_ent_id: "a",
					balance: 5,
					usage: 0,
					expires_at: null,
					entities: {},
				},
			],
			command: createDeleteBalanceCommand({
				customerEntitlementFilters: { balanceId: "balance-a" },
			}),
		});

		expect(idsOf(after)).toEqual(["b"]);
		expect(after.rollovers).toEqual([]);
	});

	test("without recalculate the deleted usage is not moved (2a)", () => {
		const { after } = deleteFrom({
			customerEntitlements: [
				row({ id: "a", balance: 60, loose: true, externalId: "balance-a" }),
				row({ id: "b", balance: 200, loose: true, externalId: "balance-b" }),
			],
			command: createDeleteBalanceCommand({
				customerEntitlementFilters: { balanceId: "balance-a" },
			}),
		});

		expect(rowOf({ state: after, id: "b" })?.balance).toBe(200);
	});

	test("a product that loses a grant is marked custom (5)", () => {
		const { after } = deleteFrom({
			customerEntitlements: [row({ id: "a", balance: 100 })],
		});

		expect(after.customerProducts[0]?.is_custom).toBe(true);
	});

	test("nothing matching, a filter typo, or only a drained loose grant is balance_not_found (4)", () => {
		for (const [customerEntitlements, command] of [
			[[], createDeleteBalanceCommand()],
			[
				[row({ id: "a", balance: 100, loose: true, externalId: "balance-a" })],
				createDeleteBalanceCommand({
					customerEntitlementFilters: { balanceId: "typo" },
				}),
			],
			[
				[row({ id: "a", balance: 0, loose: true, nextResetAt: null })],
				createDeleteBalanceCommand(),
			],
		] as const) {
			expect(() =>
				deleteFrom({
					customerEntitlements: [...customerEntitlements],
					command,
				}),
			).toThrow(new UnsupportedCommandError({ reason: "balance_not_found" }));
		}
	});
});

describe("deleteBalance: recalculate", () => {
	const recalculate = createDeleteBalanceCommand({ recalculate: true });

	test("the deleted grant's usage is drawn from the feature's grant that remains (2b)", () => {
		const { after } = deleteFrom({
			customerEntitlements: [
				row({ id: "a", balance: 60, externalId: "balance-a" }),
				row({ id: "b", balance: 100, createdAt: occurredAt + 1 }),
			],
			command: createDeleteBalanceCommand({
				recalculate: true,
				customerEntitlementFilters: { balanceId: "balance-a" },
			}),
		});

		expect(idsOf(after)).toEqual(["b"]);
		expect(rowOf({ state: after, id: "b" })?.balance).toBe(60);
	});

	test("overage usage moves too (2d)", () => {
		const { after } = deleteFrom({
			customerEntitlements: [
				row({
					id: "a",
					balance: -30,
					usageAllowed: true,
					externalId: "balance-a",
				}),
				row({ id: "b", balance: 100, createdAt: occurredAt + 1 }),
			],
			command: createDeleteBalanceCommand({
				recalculate: true,
				customerEntitlementFilters: { balanceId: "balance-a" },
			}),
		});

		expect(rowOf({ state: after, id: "b" })?.balance).toBe(-30);
	});

	test("with no grant left, the deleted one stays as an overage carrier that never resets (2e, 2f)", () => {
		const { after, mutation } = deleteFrom({
			customerEntitlements: [row({ id: "a", balance: 60 })],
			command: recalculate,
		});

		expect(rowOf({ state: after, id: "a" })).toMatchObject({
			balance: -40,
			adjustment: -GRANT,
			additional_balance: 0,
			next_reset_at: null,
			reset_cycle_anchor: null,
		});
		expect(mutation.result).toMatchObject({
			deletedIds: [],
			overageCarrierId: "a",
		});
	});

	test("several deleted grants fold into one carrier (2h)", () => {
		const { after } = deleteFrom({
			customerEntitlements: [
				row({ id: "a", balance: 60 }),
				row({ id: "c", balance: 70, createdAt: occurredAt + 1 }),
			],
			command: recalculate,
		});

		expect(idsOf(after)).toEqual(["a"]);
		expect(rowOf({ state: after, id: "a" })?.balance).toBe(-70);
	});

	test("a per-entity grant carries each entity's own usage (2g)", () => {
		const { after } = deleteFrom({
			customerEntitlements: [
				{
					...row({ id: "per_entity", balance: 0 }),
					entities: {
						[entity.id]: { id: entity.id, balance: 60, adjustment: 0 },
					},
				},
			],
			command: recalculate,
			perEntity: true,
		});

		expect(rowOf({ state: after, id: "per_entity" })?.entities).toEqual({
			[entity.id]: {
				id: entity.id,
				balance: -40,
				adjustment: -GRANT,
				additional_balance: 0,
			},
		});
	});

	test("no usage deletes the grant and draws nothing", () => {
		const { after } = deleteFrom({
			customerEntitlements: [
				row({ id: "a", balance: GRANT, externalId: "balance-a" }),
				row({ id: "b", balance: 50, createdAt: occurredAt + 1 }),
			],
			command: createDeleteBalanceCommand({
				recalculate: true,
				customerEntitlementFilters: { balanceId: "balance-a" },
			}),
		});

		expect(idsOf(after)).toEqual(["b"]);
		expect(rowOf({ state: after, id: "b" })?.balance).toBe(50);
	});
});
