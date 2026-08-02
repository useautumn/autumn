/**
 * Contract: an org "subscribes" to an event when it has an endpoint that
 * receives it. An endpoint with no filter types receives EVERY event, which
 * is Svix's own semantic — getting this backwards would either spam orgs
 * that filtered the event out, or silently skip orgs that listen to all.
 */

import { describe, expect, test } from "bun:test";
import { endpointReceivesEvent } from "@/external/svix/subscriptions/utils/classifySvixSubscriptionUtils.js";

const EVENT = "billing.updated";

describe("endpointReceivesEvent", () => {
	test("an unfiltered endpoint receives every event", () => {
		expect(endpointReceivesEvent({ endpoint: {}, eventType: EVENT })).toBe(
			true,
		);
		expect(
			endpointReceivesEvent({
				endpoint: { filterTypes: [] },
				eventType: EVENT,
			}),
		).toBe(true);
		expect(
			endpointReceivesEvent({
				endpoint: { filterTypes: null },
				eventType: EVENT,
			}),
		).toBe(true);
	});

	test("a filtered endpoint receives only its listed events", () => {
		expect(
			endpointReceivesEvent({
				endpoint: { filterTypes: [EVENT, "customer.products.updated"] },
				eventType: EVENT,
			}),
		).toBe(true);

		expect(
			endpointReceivesEvent({
				endpoint: { filterTypes: ["customer.products.updated"] },
				eventType: EVENT,
			}),
		).toBe(false);
	});
});
