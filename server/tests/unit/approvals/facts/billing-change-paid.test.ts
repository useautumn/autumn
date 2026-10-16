import { describe, expect, test } from "bun:test";
import type { FreeTrialFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import {
	isBillingChangePaid,
	type PaidPlanSignals,
} from "@/internal/approvals/facts/billing/isBillingChangePaid";

const trial = (overrides: Partial<FreeTrialFacts> = {}): FreeTrialFacts => ({
	duration: { length: 14, unit: "day" },
	starts_at: 0,
	card_required: false,
	on_end: "bill",
	...overrides,
});

const plan = (overrides: Partial<PaidPlanSignals> = {}): PaidPlanSignals => ({
	trial: null,
	raisesRecurringPrice: true,
	addsPayPerUsePrice: false,
	...overrides,
});

const paid = ({
	plans,
	billsWithoutCustomer = false,
	raisesNextCycle = true,
	raisesRecurringPrice = false,
	checkout = false,
	total = 0,
}: {
	plans: PaidPlanSignals[];
	billsWithoutCustomer?: boolean;
	raisesNextCycle?: boolean;
	raisesRecurringPrice?: boolean;
	checkout?: boolean;
	total?: number;
}) =>
	isBillingChangePaid({
		plans,
		billsWithoutCustomer,
		raisesNextCycle,
		raisesRecurringPrice,
		checkout,
		total,
	});

describe("isBillingChangePaid", () => {
	test("a card-less trial with no card on file isn't paid", () => {
		expect(paid({ plans: [plan({ trial: trial() })] })).toBe(false);
	});

	test("a card-less trial with a card already on file is paid, since Stripe will charge it", () => {
		expect(
			paid({ plans: [plan({ trial: trial() })], billsWithoutCustomer: true }),
		).toBe(true);
	});

	test("a card-required trial that reverts on end isn't paid", () => {
		expect(
			paid({
				plans: [
					plan({ trial: trial({ card_required: true, on_end: "revert" }) }),
				],
				billsWithoutCustomer: true,
			}),
		).toBe(false);
	});

	test("a card-required trial that bills on end is paid", () => {
		expect(
			paid({ plans: [plan({ trial: trial({ card_required: true }) })] }),
		).toBe(true);
	});

	test("a card-less trial on one plan doesn't hide a second plan's charge", () => {
		expect(
			paid({ plans: [plan({ trial: trial() }), plan({ trial: null })] }),
		).toBe(true);
	});

	test("checkout and an amount due now are paid", () => {
		expect(paid({ plans: [], raisesNextCycle: false, checkout: true })).toBe(
			true,
		);
		expect(paid({ plans: [], raisesNextCycle: false, total: 5 })).toBe(true);
	});

	test("two plans each cheaper than the old one, together dearer, are paid", () => {
		const cheaper = plan({ raisesRecurringPrice: false });
		expect(
			paid({
				plans: [cheaper, cheaper],
				raisesNextCycle: false,
				raisesRecurringPrice: true,
			}),
		).toBe(true);
	});

	test("an update that only raises the next cycle is paid", () => {
		expect(paid({ plans: [] })).toBe(true);
	});
});
