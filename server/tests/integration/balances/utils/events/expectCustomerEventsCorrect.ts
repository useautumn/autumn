import { expect } from "bun:test";
import type { CreateEvent } from "@autumn/shared";
import { timeout } from "@/utils/genUtils";
import { getCustomerEvents } from "./getCustomerEvents.js";

/**
 * Waits for event batching, fetches events (newest-first), then asserts values.
 * For a check + confirm flow, events[0] = finalize delta (finalValue - lockValue),
 * events[1] = track value from initial check (= requiredBalance).
 */
export const expectCustomerEventsCorrect = async ({
	customerId,
	events: expectedEvents,
}: {
	customerId: string;
	events: {
		value: number;
		properties?: Exclude<CreateEvent["properties"], undefined>;
	}[];
}) => {
	await timeout(3000);
	const events = await getCustomerEvents({ customerId });

	expect(events).toHaveLength(expectedEvents.length);
	for (let i = 0; i < expectedEvents.length; i++) {
		expect(events[i].value).toBe(expectedEvents[i].value);
		const expectedProperties = expectedEvents[i].properties;
		if (expectedProperties !== undefined) {
			expect(events[i].properties).toEqual(expectedProperties);
		}
	}
};
