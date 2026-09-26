import { expect } from "bun:test";
import type { CreateEvent } from "@autumn/shared";
import { pollUntilAsserted, timeout } from "@tests/utils/genUtils.js";
import { getCustomerEvents } from "./getCustomerEvents.js";

/** Long enough for a late extra event to show up before the first matching read. */
const EVENTS_SETTLE_MS = 3000;
/** Herald writes worker events to Tinybird before Postgres, so under load they land seconds late. */
const EVENTS_ARRIVAL_TIMEOUT_MS = 30_000;

type ExpectedEvent = {
	value: number;
	properties?: Exclude<CreateEvent["properties"], undefined>;
};

/**
 * Waits for events to land, then asserts them newest-first.
 * For a check + confirm flow, events[0] = finalize delta (finalValue - lockValue), events[1] = the lock's value.
 */
export const expectCustomerEventsCorrect = async ({
	customerId,
	events: expectedEvents,
}: {
	customerId: string;
	events: ExpectedEvent[];
}) => {
	await timeout(EVENTS_SETTLE_MS);
	await pollUntilAsserted({
		fetch: () => getCustomerEvents({ customerId }),
		assert: (events) => {
			expect(events).toHaveLength(expectedEvents.length);
			for (const [index, expectedEvent] of expectedEvents.entries()) {
				expect(events[index].value).toBe(expectedEvent.value);
				if (expectedEvent.properties !== undefined) {
					expect(events[index].properties).toEqual(expectedEvent.properties);
				}
			}
		},
		timeoutMs: EVENTS_ARRIVAL_TIMEOUT_MS,
	});
};
