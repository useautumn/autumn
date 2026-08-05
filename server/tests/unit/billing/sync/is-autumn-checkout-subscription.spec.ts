/**
 * Contract for the `customer.subscription.created` auto-sync checkout gate.
 *
 * `isAutumnCheckoutSubscription` is the ONLY branch that behaves differently
 * for a subscription born from a Stripe Checkout Session vs one created
 * straight through the subscriptions API, so it is pinned here instead of in
 * an integration test — completing a hosted Checkout page needs a real
 * browser, and Stripe exposes no API to complete a session.
 *
 * Contract under test:
 *   - no checkout session for the sub (plain API-created sub)      -> false (sync)
 *   - session exists WITHOUT autumn_metadata_id (external checkout) -> false (sync)
 *   - session exists WITH autumn_metadata_id (Autumn checkout)      -> true  (skip,
 *     because checkout.session.completed materializes the cus_product itself)
 *   - the lookup is scoped to the subscription and asks for one session
 *
 * End-to-end coverage of the "sub created outside Autumn gets linked" flow
 * lives in
 * tests/integration/billing/stripe-webhooks/subscription-created/sub-created-auto-sync.test.ts.
 */
import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import { isAutumnCheckoutSubscription } from "@/internal/billing/v2/actions/sync/utils/isAutumnCheckoutSubscription";

const subscription = { id: "sub_auto_sync_gate" } as Stripe.Subscription;

const fakeStripe = ({
	sessions,
}: {
	sessions: Partial<Stripe.Checkout.Session>[];
}) => {
	const listParams: Stripe.Checkout.SessionListParams[] = [];

	const stripeCli = {
		checkout: {
			sessions: {
				list: async (params: Stripe.Checkout.SessionListParams) => {
					listParams.push(params);
					return { data: sessions, has_more: false };
				},
			},
		},
	} as unknown as Stripe;

	return { stripeCli, listParams };
};

describe("isAutumnCheckoutSubscription", () => {
	test("no checkout session -> not an Autumn checkout sub", async () => {
		const { stripeCli, listParams } = fakeStripe({ sessions: [] });

		expect(
			await isAutumnCheckoutSubscription({ stripeCli, subscription }),
		).toBe(false);
		expect(listParams).toEqual([{ subscription: subscription.id, limit: 1 }]);
	});

	test("external checkout session (no autumn_metadata_id) -> not an Autumn checkout sub", async () => {
		const { stripeCli } = fakeStripe({
			sessions: [{ id: "cs_test_external", metadata: { source: "merchant" } }],
		});

		expect(
			await isAutumnCheckoutSubscription({ stripeCli, subscription }),
		).toBe(false);
	});

	test("checkout session with null metadata -> not an Autumn checkout sub", async () => {
		const { stripeCli } = fakeStripe({
			sessions: [{ id: "cs_test_no_metadata", metadata: null }],
		});

		expect(
			await isAutumnCheckoutSubscription({ stripeCli, subscription }),
		).toBe(false);
	});

	test("Autumn checkout session -> skip auto-sync", async () => {
		const { stripeCli } = fakeStripe({
			sessions: [
				{
					id: "cs_test_autumn",
					metadata: { autumn_metadata_id: "am_123" },
				},
			],
		});

		expect(
			await isAutumnCheckoutSubscription({ stripeCli, subscription }),
		).toBe(true);
	});
});
