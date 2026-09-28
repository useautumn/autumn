import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	EntInterval,
	PriceType,
} from "@autumn/shared";
import {
	applyMutation,
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
	testProductInternalId,
} from "../../engineFixtures.js";

// Mirrors server/tests/integration/balances/update/next-reset-at/, expires-at/ and update-balance-combined.

const SOON = occurredAt + 1_000;
const LATER = occurredAt + 2_000;
const NEW_DATE = occurredAt + 9_000;

const update = ({
	customerEntitlements,
	command,
	lifetimeRowIds = [],
	pricedRowIds = [],
}: {
	customerEntitlements: WorkerCustomerEntitlement[];
	command: ReturnType<typeof createUpdateBalanceCommand>;
	lifetimeRowIds?: string[];
	pricedRowIds?: string[];
}): { state: SubjectState; after: SubjectState | null } => {
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerPrices: pricedRowIds.length
			? [
					{
						id: "cpr_1",
						internal_customer_id: "cus_internal_1",
						customer_product_id: "cp_1",
						price_id: "price_1",
						created_at: occurredAt,
					},
				]
			: [],
		customerEntitlements,
	});
	const catalog = createCatalogFor({ state });
	for (const row of customerEntitlements) {
		const entitlement = catalog.entitlements[row.entitlement_id];
		if (!entitlement) throw new Error("fixture entitlement missing");
		if (lifetimeRowIds.includes(row.id))
			entitlement.interval = EntInterval.Lifetime;
		if (pricedRowIds.includes(row.id))
			catalog.prices.price_1 = {
				id: "price_1",
				internal_product_id: testProductInternalId,
				entitlement_id: row.entitlement_id,
				proration_config: null,
				config: {
					type: PriceType.Usage,
					bill_when: BillWhen.StartOfPeriod,
					should_prorate: false,
					billing_units: 1,
					internal_feature_id: "feat_messages",
					feature_id: "messages",
					usage_tiers: [{ to: "inf", amount: 1 }],
					interval: BillingInterval.Month,
				},
			};
	}
	const mutation = computeUpdateBalance({
		fullSubject: subjectStateToFullSubject({ state, catalog }),
		command,
	});
	return { state, after: mutation ? applyMutation({ state, mutation }) : null };
};

const rowAfter = ({ after, id }: { after: SubjectState | null; id: string }) =>
	after?.customerEntitlements.find((row) => row.id === id);

const withDates = ({
	id,
	nextResetAt = null,
	expiresAt = null,
}: {
	id: string;
	nextResetAt?: number | null;
	expiresAt?: number | null;
}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id }),
	next_reset_at: nextResetAt,
	expires_at: expiresAt,
});

describe("updateBalance: next_reset_at", () => {
	test("moves the soonest reset and leaves the others", () => {
		const { after } = update({
			customerEntitlements: [
				withDates({ id: "later", nextResetAt: LATER }),
				withDates({ id: "soon", nextResetAt: SOON }),
			],
			command: createUpdateBalanceCommand({ nextResetAt: NEW_DATE }),
		});

		expect(rowAfter({ after, id: "soon" })?.next_reset_at).toBe(NEW_DATE);
		expect(rowAfter({ after, id: "later" })?.next_reset_at).toBe(LATER);
	});

	test("a lifetime balance has no reset to move", () => {
		expect(() =>
			update({
				customerEntitlements: [withDates({ id: "lifetime" })],
				lifetimeRowIds: ["lifetime"],
				command: createUpdateBalanceCommand({ nextResetAt: NEW_DATE }),
			}),
		).toThrow(
			new UnsupportedCommandError({ reason: "lifetime_balance_has_no_reset" }),
		);
	});
});

describe("updateBalance: expires_at", () => {
	test("sets the soonest expiry, rows without one last", () => {
		const { after } = update({
			customerEntitlements: [
				withDates({ id: "never" }),
				withDates({ id: "soon", expiresAt: SOON }),
			],
			command: createUpdateBalanceCommand({ expiresAt: NEW_DATE }),
		});

		expect(rowAfter({ after, id: "soon" })?.expires_at).toBe(NEW_DATE);
		expect(rowAfter({ after, id: "never" })?.expires_at).toBeNull();
	});

	test("a paid recurring balance cannot expire; a paid one-off can", () => {
		expect(() =>
			update({
				customerEntitlements: [withDates({ id: "prepaid" })],
				pricedRowIds: ["prepaid"],
				command: createUpdateBalanceCommand({ expiresAt: NEW_DATE }),
			}),
		).toThrow(
			new UnsupportedCommandError({
				reason: "paid_recurring_balance_cannot_expire",
			}),
		);

		const { after } = update({
			customerEntitlements: [withDates({ id: "top_up" })],
			pricedRowIds: ["top_up"],
			lifetimeRowIds: ["top_up"],
			command: createUpdateBalanceCommand({ expiresAt: NEW_DATE }),
		});
		expect(rowAfter({ after, id: "top_up" })?.expires_at).toBe(NEW_DATE);
	});
});

describe("updateBalance: fields land together or not at all", () => {
	test("a balance and a reset land in one mutation", () => {
		const { after } = update({
			customerEntitlements: [
				{ ...withDates({ id: "monthly", nextResetAt: SOON }), balance: 10 },
			],
			command: createUpdateBalanceCommand({
				remaining: 4,
				nextResetAt: NEW_DATE,
			}),
		});

		expect(rowAfter({ after, id: "monthly" })).toMatchObject({
			balance: 4,
			next_reset_at: NEW_DATE,
		});
	});

	test("a refused reset leaves the balance untouched", () => {
		expect(() =>
			update({
				customerEntitlements: [withDates({ id: "lifetime" })],
				lifetimeRowIds: ["lifetime"],
				command: createUpdateBalanceCommand({
					remaining: 4,
					nextResetAt: NEW_DATE,
				}),
			}),
		).toThrow(
			new UnsupportedCommandError({ reason: "lifetime_balance_has_no_reset" }),
		);
	});
});
