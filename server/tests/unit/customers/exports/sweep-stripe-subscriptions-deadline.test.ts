/**
 * A Stripe list page that never settles must not stall the org-wide sweep.
 *
 * The Stripe SDK reads a response body with `res.toJSON()`, which registers no
 * error handler, so a body interrupted after its headers arrive leaves the
 * promise pending forever and `maxNetworkRetries` never engages.
 *
 * Red (current):  sweepStripeSubscriptions awaits subscriptions.list with no
 *                 bound, so one silent page hangs the sweep and the run.
 * Green (after):  each page is bounded and retried, and the sweep throws once
 *                 the attempts are spent rather than hanging.
 */

import { describe, expect, it } from "bun:test";
import type Stripe from "stripe";
import { sweepStripeSubscriptions } from "@/internal/customers/exports/verify/sweepStripeSubscriptions.js";

const JANUARY_2026 = Date.UTC(2026, 0, 1);
const FEBRUARY_2026 = Date.UTC(2026, 1, 1);

const neverSettles = () => new Promise<never>(() => {});

const subscriptionPage = ({ customerId }: { customerId: string }) => ({
	data: [{ id: `sub_${customerId}`, customer: customerId }],
	has_more: false,
});

const emptyPage = () => ({ data: [], has_more: false });

const stripeCliWith = ({
	list,
}: {
	list: (params: Stripe.SubscriptionListParams) => Promise<unknown>;
}) =>
	({
		subscriptions: { list },
		testHelpers: { testClocks: { list: () => [] } },
	}) as unknown as Stripe;

describe("sweepStripeSubscriptions deadline", () => {
	it("retries a page that never settles and throws once attempts are spent", async () => {
		let calls = 0;
		const stripeCli = stripeCliWith({
			list: () => {
				calls++;
				return neverSettles();
			},
		});

		const sweep = sweepStripeSubscriptions({
			stripeCli,
			includeTestClocks: false,
			sinceMs: JANUARY_2026,
			untilMs: FEBRUARY_2026,
			limits: { pageTimeoutMs: 50, retryDelayMs: 0 },
		});

		await expect(sweep).rejects.toThrow(/timed out/);
		expect(calls).toBeGreaterThan(1);
	});

	it("recovers when a hung page succeeds on its retry", async () => {
		let hangsLeft = 1;
		const stripeCli = stripeCliWith({
			list: ({ created }: Stripe.SubscriptionListParams) => {
				if (hangsLeft > 0) {
					hangsLeft--;
					return neverSettles();
				}
				const isFirstWindow =
					typeof created === "object" && created !== null && "lt" in created;
				if (!isFirstWindow) return Promise.resolve(emptyPage());
				return Promise.resolve(
					subscriptionPage({ customerId: "cus_stripe_1" }),
				);
			},
		});

		const swept = await sweepStripeSubscriptions({
			stripeCli,
			includeTestClocks: false,
			sinceMs: JANUARY_2026,
			untilMs: FEBRUARY_2026,
			limits: { pageTimeoutMs: 50, retryDelayMs: 0 },
		});

		expect(swept.get("cus_stripe_1")).toHaveLength(1);
	});
});
