import { describe, expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import {
	applyMutation,
	computeRecalculateBalance,
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
	createRecalculateBalanceCommand,
	identity,
	occurredAt,
} from "../../engineFixtures.js";

// Mirrors server/tests/integration/balances/recalculate/recalculate-balance.test.ts.

const row = ({
	id,
	balance,
	allowance = 100,
	usageAllowed = false,
	createdAt = occurredAt,
	loose = false,
	nextResetAt = occurredAt + 1_000,
}: {
	id: string;
	balance: number;
	allowance?: number;
	usageAllowed?: boolean;
	createdAt?: number;
	loose?: boolean;
	nextResetAt?: number | null;
}) => ({
	row: {
		...createCustomerEntitlement({ id, balance }),
		customer_product_id: loose ? null : "cp_1",
		usage_allowed: usageAllowed,
		created_at: createdAt,
		next_reset_at: nextResetAt,
	} satisfies WorkerCustomerEntitlement,
	allowance,
});

const recalculate = ({
	rows,
	invoiceCredit = false,
}: {
	rows: ReturnType<typeof row>[];
	invoiceCredit?: boolean;
}) => {
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: rows.map(({ row }) => row),
	});
	const catalog = createCatalogFor({ state });
	for (const { row: customerEntitlement, allowance } of rows) {
		const entitlement =
			catalog.entitlements[customerEntitlement.entitlement_id];
		if (entitlement) entitlement.allowance = allowance;
	}
	if (invoiceCredit) {
		const feature = catalog.features.feat_messages;
		if (feature) {
			feature.type = FeatureType.CreditSystem;
			feature.config = { schema: [], invoice_credit: true };
		}
	}
	const decision = computeRecalculateBalance({
		fullSubject: subjectStateToFullSubject({ state, catalog }),
		command: createRecalculateBalanceCommand(),
	});
	const after: SubjectState = decision.mutation
		? applyMutation({ state, mutation: decision.mutation })
		: state;
	return { ...decision, after };
};

const balanceOf = ({ state, id }: { state: SubjectState; id: string }) =>
	state.customerEntitlements.find((candidate) => candidate.id === id)?.balance;

describe("recalculateBalance", () => {
	test("a grant's surplus absorbs another's overage; the total is unchanged (1, 3)", () => {
		const { result, after } = recalculate({
			rows: [
				row({ id: "overdrawn", balance: -30, usageAllowed: true }),
				row({
					id: "surplus",
					balance: 200,
					allowance: 200,
					createdAt: occurredAt + 1,
				}),
			],
		});

		expect(result.totalUsage).toBe(130);
		const before = result.customerEntitlements.map((r) => r.beforeRemaining);
		const afterRemaining = result.customerEntitlements.map(
			(r) => r.afterRemaining,
		);
		expect(before.reduce((a, b) => a + b, 0)).toBe(170);
		expect(afterRemaining.reduce((a, b) => a + b, 0)).toBe(170);
		expect(afterRemaining.every((remaining) => remaining >= 0)).toBe(true);
		// Draw order takes a grant without usage_allowed first: the surplus absorbs all 130.
		expect(balanceOf({ state: after, id: "overdrawn" })).toBe(100);
		expect(balanceOf({ state: after, id: "surplus" })).toBe(70);
	});

	test("nothing overdrawn is a no-op: no mutation, after equals before (4)", () => {
		const { mutation, result } = recalculate({
			rows: [
				row({ id: "a", balance: 60 }),
				row({ id: "b", balance: 100, createdAt: occurredAt + 1 }),
			],
		});

		expect(mutation).toBeNull();
		for (const entry of result.customerEntitlements)
			expect(entry.afterRemaining).toBe(entry.beforeRemaining);
	});

	test("a drained loose grant is left out: not reset, its usage not redrawn", () => {
		const { result, after } = recalculate({
			rows: [
				row({ id: "overdrawn", balance: -30, usageAllowed: true }),
				row({
					id: "surplus",
					balance: 200,
					allowance: 200,
					createdAt: occurredAt + 1,
				}),
				row({
					id: "drained",
					balance: 0,
					loose: true,
					nextResetAt: null,
				}),
			],
		});

		expect(
			result.customerEntitlements.map((r) => r.customerEntitlementId),
		).not.toContain("drained");
		expect(result.totalUsage).toBe(130);
		expect(balanceOf({ state: after, id: "drained" })).toBe(0);
	});

	test("no grant for the feature is balance_not_found; an invoice credit is refused", () => {
		expect(() => recalculate({ rows: [] })).toThrow(
			new UnsupportedCommandError({ reason: "balance_not_found" }),
		);
		expect(() =>
			recalculate({
				rows: [row({ id: "a", balance: -30, usageAllowed: true })],
				invoiceCredit: true,
			}),
		).toThrow(
			new UnsupportedCommandError({ reason: "invoice_credit_not_mutable" }),
		);
	});
});
