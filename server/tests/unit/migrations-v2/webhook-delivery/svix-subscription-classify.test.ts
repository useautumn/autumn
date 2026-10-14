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
