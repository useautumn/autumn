import type { ApiCustomerV5 } from "@autumn/shared";
import { createExternalStripeSubscription } from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import {
	createStripeFixedPriceUnderProduct,
	getBaseStripePriceId,
} from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";
import { ProductService } from "@/internal/products/ProductService";

export const INCLUDED_SEATS = 1;

export type AutumnV2_3 = Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];

/** Polls until the customer's single pool matches the expected counters. */
export const waitForPoolCounters = async ({
	autumnV2_3,
	customerId,
	licensePlanId,
	parentPlanId,
	paidQuantity,
	usage = 0,
}: {
	autumnV2_3: AutumnV2_3;
	customerId: string;
	licensePlanId: string;
	parentPlanId: string;
	paidQuantity: number;
	usage?: number;
}) => {
	const granted = INCLUDED_SEATS + paidQuantity;
	const deadline = Date.now() + 60_000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const customer =
				await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
			expectCustomerLicenses({
				customer,
				count: 1,
				licenses: [
					{
						license_plan_id: licensePlanId,
						parent_plan_id: parentPlanId,
						paid_quantity: paidQuantity,
						granted,
						usage,
						remaining: granted - usage,
					},
				],
			});
			return;
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		}
	}
	throw lastError;
};

export const setupLicenseSubscription = async ({
	customerId,
	idPrefix,
	quantity,
	customSeatPrice,
}: {
	customerId: string;
	idPrefix: string;
	quantity: number;
	/** Subscribe via an ad-hoc price on the seat's Stripe product instead of
	 * the catalog base price — back-syncs as a customized license. */
	customSeatPrice?: { amount: number; interval: "month" | "year" };
}) => {
	const parent = products.base({
		id: `${idPrefix}-parent`,
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: `${idPrefix}-seat`,
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
		group: `${idPrefix}-licenses`,
	});

	const v1CustomerId = `${customerId}-v1`;
	const { autumnV2_3 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: v1CustomerId, paymentMethod: "success" }]),
			s.products({ list: [parent, devSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: devSeat.id,
				included: INCLUDED_SEATS,
			}),
			s.attach({ productId: devSeat.id, customerId: v1CustomerId }),
		],
	});

	const seatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: devSeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	let seatStripePriceId = getBaseStripePriceId({ fullProduct: seatFull });
	if (customSeatPrice) {
		const seatStripeProductId = seatFull.processor?.id;
		if (!seatStripeProductId) {
			throw new Error("Seat product has no Stripe product id");
		}
		const customStripePrice = await createStripeFixedPriceUnderProduct({
			ctx,
			stripeProductId: seatStripeProductId,
			unitAmount: customSeatPrice.amount * 100,
			interval: customSeatPrice.interval,
		});
		seatStripePriceId = customStripePrice.id;
	}

	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: seatStripePriceId, quantity }],
	});
	const seatItem = subscription.items.data.find(
		(item) => item.price.id === seatStripePriceId,
	);
	if (!seatItem) throw new Error("License subscription item not found");

	// Baseline: sub.created back-sync provisions the pool at `quantity`.
	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: quantity,
	});

	return { autumnV2_3, parent, devSeat, subscription, seatItem };
};

export const updateSeatQuantity = async ({
	subscription,
	seatItem,
	quantity,
}: {
	subscription: Stripe.Subscription;
	seatItem: Stripe.SubscriptionItem;
	quantity: number;
}) =>
	ctx.stripeCli.subscriptions.update(subscription.id, {
		items: [{ id: seatItem.id, quantity }],
		proration_behavior: "none",
	});
