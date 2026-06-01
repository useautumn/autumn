import { describe, expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";

const currentEpochMs = Date.UTC(2026, 4, 29);
const pastStartsAt = Date.UTC(2026, 4, 1);
const futureStartsAt = Date.UTC(2026, 5, 10);

const paidRecurring = products.createFull({
	prices: [prices.createFixed({ id: "monthly" })],
});
const freeProduct = products.createFull({ prices: [] });
const oneOffProduct = products.createFull({
	prices: [prices.createOneOff({ id: "setup" })],
});

describe("setupBillingCycleAnchor backdate branch", () => {
	test("anchors a new paid recurring subscription to a backdated start", () => {
		expect(
			setupBillingCycleAnchor({
				customerProduct: undefined,
				newFullProduct: paidRecurring,
				currentEpochMs,
				billingStartsAt: pastStartsAt,
			}),
		).toBe(pastStartsAt);
	});

	test("a future start does not backdate the anchor", () => {
		expect(
			setupBillingCycleAnchor({
				customerProduct: undefined,
				newFullProduct: paidRecurring,
				currentEpochMs,
				billingStartsAt: futureStartsAt,
			}),
		).toBe("now");
	});

	test("a present start (not strictly past) does not backdate the anchor", () => {
		expect(
			setupBillingCycleAnchor({
				customerProduct: undefined,
				newFullProduct: paidRecurring,
				currentEpochMs,
				billingStartsAt: currentEpochMs,
			}),
		).toBe("now");
	});

	test("an existing customer product blocks the backdate anchor", () => {
		const existing = customerProducts.create({
			customerPrices: [
				prices.createCustomer({ price: prices.createFixed({ id: "monthly" }) }),
			],
			startsAt: currentEpochMs - ms.days(60),
		});
		expect(
			setupBillingCycleAnchor({
				customerProduct: existing,
				newFullProduct: paidRecurring,
				currentEpochMs,
				billingStartsAt: pastStartsAt,
			}),
		).toBe("now");
	});

	test("a free product has no recurring cycle to backdate", () => {
		expect(
			setupBillingCycleAnchor({
				customerProduct: undefined,
				newFullProduct: freeProduct,
				currentEpochMs,
				billingStartsAt: pastStartsAt,
			}),
		).toBe("now");
	});

	test("a one-off product has no recurring cycle to backdate", () => {
		expect(
			setupBillingCycleAnchor({
				customerProduct: undefined,
				newFullProduct: oneOffProduct,
				currentEpochMs,
				billingStartsAt: pastStartsAt,
			}),
		).toBe("now");
	});

	test("an explicitly requested anchor wins over a backdated start", () => {
		expect(
			setupBillingCycleAnchor({
				customerProduct: undefined,
				newFullProduct: paidRecurring,
				currentEpochMs,
				billingStartsAt: pastStartsAt,
				requestedBillingCycleAnchor: futureStartsAt,
			}),
		).toBe(futureStartsAt);
	});
});
