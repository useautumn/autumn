import { describe, expect, test } from "bun:test";
import { EntInterval } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { customerAsOf } from "@/internal/billing/v2/actions/setPlans/preview/customerAsOf";

const utc = (date: string) => new Date(`${date}T00:00:00Z`).getTime();

const monthlyCustomer = ({
	nextResetAt,
	billingCycleAnchor,
}: {
	nextResetAt: number;
	billingCycleAnchor: number | null;
}) =>
	customers.create({
		customerProducts: [
			{
				...customerProducts.create({
					customerEntitlements: [
						customerEntitlements.create({
							featureId: "messages",
							featureName: "Messages",
							allowance: 100,
							balance: 100,
							interval: EntInterval.Month,
							nextResetAt,
						}),
					],
				}),
				billing_cycle_anchor: billingCycleAnchor,
			},
		],
	});

const nextResetAsOf = ({
	fullCustomer,
	at,
}: {
	fullCustomer: ReturnType<typeof customers.create>;
	at: number;
}) =>
	customerAsOf({ fullCustomer, at }).customer_products[0]
		.customer_entitlements[0].next_reset_at;

describe("customerAsOf", () => {
	test("a later phase's reset is the first after it starts", () => {
		const fullCustomer = monthlyCustomer({
			nextResetAt: utc("2026-11-14"),
			billingCycleAnchor: utc("2026-10-14"),
		});

		expect(nextResetAsOf({ fullCustomer, at: utc("2027-01-22") })).toBe(
			utc("2027-02-14"),
		);
	});

	test("a month-end reset stays on the billing anchor's day", () => {
		const fullCustomer = monthlyCustomer({
			nextResetAt: utc("2027-04-30"),
			billingCycleAnchor: utc("2027-01-31"),
		});

		expect(nextResetAsOf({ fullCustomer, at: utc("2027-05-01") })).toBe(
			utc("2027-05-31"),
		);
	});

	test("a reset not yet due is left as it is", () => {
		const fullCustomer = monthlyCustomer({
			nextResetAt: utc("2027-02-14"),
			billingCycleAnchor: utc("2026-10-14"),
		});

		expect(nextResetAsOf({ fullCustomer, at: utc("2027-01-22") })).toBe(
			utc("2027-02-14"),
		);
	});
});
