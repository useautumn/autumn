/**
 * futurePhaseItemsChanged
 *
 * Only a phase that has not started yet counts. A quantity or price edit on
 * it is a change; a date move, or an edit to the running phase, is not.
 */

import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import { futurePhaseItemsChanged } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionScheduleUpdated/futurePhaseItemsChanged.js";

const NOW = 1_790_000_000;
const PAST = NOW - 1_000;
const FUTURE = NOW + 1_000;

const phase = ({
	start,
	price = "price_a",
	quantity = 1,
}: {
	start: number;
	price?: string;
	quantity?: number;
}) =>
	({
		start_date: start,
		items: [{ price, quantity }],
	}) as unknown as Stripe.SubscriptionSchedule.Phase;

describe("futurePhaseItemsChanged", () => {
	test("a future phase quantity edit is a change", () => {
		expect(
			futurePhaseItemsChanged({
				previousPhases: [
					phase({ start: PAST }),
					phase({ start: FUTURE, quantity: 18 }),
				],
				currentPhases: [
					phase({ start: PAST }),
					phase({ start: FUTURE, quantity: 21 }),
				],
				nowSeconds: NOW,
			}),
		).toBe(true);
	});

	test("a future phase price edit is a change", () => {
		expect(
			futurePhaseItemsChanged({
				previousPhases: [phase({ start: PAST }), phase({ start: FUTURE })],
				currentPhases: [
					phase({ start: PAST }),
					phase({ start: FUTURE, price: "price_b" }),
				],
				nowSeconds: NOW,
			}),
		).toBe(true);
	});

	test("an edit to the running phase is not", () => {
		expect(
			futurePhaseItemsChanged({
				previousPhases: [
					phase({ start: PAST, quantity: 1 }),
					phase({ start: FUTURE }),
				],
				currentPhases: [
					phase({ start: PAST, quantity: 2 }),
					phase({ start: FUTURE }),
				],
				nowSeconds: NOW,
			}),
		).toBe(false);
	});

	test("a future phase moved to a new date with the same items is not", () => {
		expect(
			futurePhaseItemsChanged({
				previousPhases: [
					phase({ start: PAST }),
					phase({ start: FUTURE, quantity: 2 }),
				],
				currentPhases: [
					phase({ start: PAST }),
					phase({ start: FUTURE + 1_000, quantity: 2 }),
				],
				nowSeconds: NOW,
			}),
		).toBe(false);
	});

	test("identical future phases are not", () => {
		expect(
			futurePhaseItemsChanged({
				previousPhases: [
					phase({ start: PAST }),
					phase({ start: FUTURE, quantity: 2 }),
				],
				currentPhases: [
					phase({ start: PAST }),
					phase({ start: FUTURE, quantity: 2 }),
				],
				nowSeconds: NOW,
			}),
		).toBe(false);
	});
});
