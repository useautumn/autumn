/**
 * TDD test for Stripe sync rejecting a new-currency subscription after the
 * previous paid plan expired and left customers.currency set.
 *
 * Red-failure mode (current behavior):
 *  - leftover USD + expired/free Autumn products + incoming GBP paid sync throws
 *    CurrencyMismatch
 *  - syncContextToCurrencyLock returns undefined when currency is already set
 *
 * Green-success criteria (after fix):
 *  - leftover currency with no live paid product does not throw
 *  - live paid product in a different currency still throws
 *  - leftover currency with an incoming paid Stripe sub produces a relock
 */

import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
	ErrCode,
	type FullCusProduct,
	PriceType,
	RecaseError,
	type SyncBillingContext,
} from "@autumn/shared";
import { assertSyncCurrencyMatchesCustomer } from "@/internal/billing/v2/actions/sync/errors/assertSyncCurrencyMatchesCustomer";
import { syncContextToCurrencyLock } from "@/internal/billing/v2/actions/sync/utils/syncContextUtils";

const paidPrice = {
	config: {
		type: PriceType.Fixed,
		amount: 10,
		interval: BillingInterval.Month,
	},
};
const freePrice = {
	config: { type: PriceType.Fixed, amount: 0, interval: BillingInterval.Month },
};

const customerProduct = ({
	status,
	paid,
}: {
	status: CusProductStatus;
	paid: boolean;
}) =>
	({
		status,
		customer_prices: [{ price: paid ? paidPrice : freePrice }],
		customer_licenses: [],
	}) as unknown as FullCusProduct;

const syncContext = ({
	customerCurrency = "usd",
	syncCurrency = "gbp",
	customerProducts = [],
	hasIncomingPaidProduct = true,
	stripeSubscription = { id: "sub_1" },
}: {
	customerCurrency?: string | null;
	syncCurrency?: string;
	customerProducts?: FullCusProduct[];
	hasIncomingPaidProduct?: boolean;
	stripeSubscription?: { id: string } | null;
} = {}) =>
	({
		currency: syncCurrency,
		fullCustomer: {
			internal_id: "cus_internal",
			currency: customerCurrency,
			customer_products: customerProducts,
		},
		stripeSubscription,
		immediatePhase: hasIncomingPaidProduct
			? {
					productContexts: [
						{
							fullProduct: {
								prices: [paidPrice],
							},
						},
					],
				}
			: { productContexts: [] },
		futurePhases: [],
	}) as unknown as SyncBillingContext;

describe("assertSyncCurrencyMatchesCustomer", () => {
	test("allows leftover currency when the customer has no live paid product", () => {
		expect(() =>
			assertSyncCurrencyMatchesCustomer({
				syncContext: syncContext({
					customerProducts: [
						customerProduct({
							status: CusProductStatus.Expired,
							paid: true,
						}),
						customerProduct({
							status: CusProductStatus.Active,
							paid: false,
						}),
					],
				}),
			}),
		).not.toThrow();
	});

	test("still rejects a different-currency sync while a paid product is live", () => {
		expect(() =>
			assertSyncCurrencyMatchesCustomer({
				syncContext: syncContext({
					customerProducts: [
						customerProduct({
							status: CusProductStatus.Active,
							paid: true,
						}),
					],
				}),
			}),
		).toThrow(RecaseError);

		try {
			assertSyncCurrencyMatchesCustomer({
				syncContext: syncContext({
					customerProducts: [
						customerProduct({
							status: CusProductStatus.Active,
							paid: true,
						}),
					],
				}),
			});
		} catch (error) {
			expect(error).toBeInstanceOf(RecaseError);
			expect((error as RecaseError).code).toBe(ErrCode.CurrencyMismatch);
		}
	});
});

describe("syncContextToCurrencyLock", () => {
	test("relocks leftover currency onto the incoming Stripe subscription currency", () => {
		expect(
			syncContextToCurrencyLock({
				syncContext: syncContext({
					customerProducts: [
						customerProduct({
							status: CusProductStatus.Expired,
							paid: true,
						}),
						customerProduct({
							status: CusProductStatus.Active,
							paid: false,
						}),
					],
				}),
			}),
		).toEqual({
			internalCustomerId: "cus_internal",
			currency: "gbp",
		});
	});

	test("does not emit a lock when currency already matches", () => {
		expect(
			syncContextToCurrencyLock({
				syncContext: syncContext({
					customerCurrency: "gbp",
					syncCurrency: "gbp",
				}),
			}),
		).toBeUndefined();
	});
});
