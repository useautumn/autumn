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
	listTestClocks = () => Promise.resolve(emptyPage()),
}: {
	list: (params: Stripe.SubscriptionListParams) => Promise<unknown>;
	listTestClocks?: () => Promise<unknown>;
}) =>
	({
		subscriptions: { list },
		testHelpers: { testClocks: { list: listTestClocks } },
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

	it("bounds the sandbox test-clock listing too", async () => {
		const stripeCli = stripeCliWith({
			list: () => Promise.resolve(emptyPage()),
			listTestClocks: neverSettles,
		});

		const sweep = sweepStripeSubscriptions({
			stripeCli,
			includeTestClocks: true,
			sinceMs: JANUARY_2026,
			untilMs: FEBRUARY_2026,
			limits: { pageTimeoutMs: 50, retryDelayMs: 0 },
		});

		await expect(sweep).rejects.toThrow(/test clock page timed out/);
	});

	it("surfaces a Stripe error without retrying it, the SDK having already tried", async () => {
		const callsPerWindow = new Map<string, number>();
		const stripeCli = stripeCliWith({
			list: ({ created }: Stripe.SubscriptionListParams) => {
				const window = JSON.stringify(created ?? {});
				callsPerWindow.set(window, (callsPerWindow.get(window) ?? 0) + 1);
				return Promise.reject(new Error("No such customer"));
			},
		});

		const sweep = sweepStripeSubscriptions({
			stripeCli,
			includeTestClocks: false,
			sinceMs: JANUARY_2026,
			untilMs: FEBRUARY_2026,
			limits: { pageTimeoutMs: 50, retryDelayMs: 0 },
		});

		await expect(sweep).rejects.toThrow(/No such customer/);
		expect(Math.max(...callsPerWindow.values())).toBe(1);
	});

	it("recovers when a hung page succeeds on its retry", async () => {
		let hangsLeft = 1;
		const stripeCli = stripeCliWith({
			list: ({ created }: Stripe.SubscriptionListParams) => {
				if (hangsLeft > 0) {
					hangsLeft--;
					return neverSettles();
				}
				const isOpenFirstWindow =
					typeof created === "object" &&
					created !== null &&
					"lt" in created &&
					!("gte" in created);
				if (!isOpenFirstWindow) return Promise.resolve(emptyPage());
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
