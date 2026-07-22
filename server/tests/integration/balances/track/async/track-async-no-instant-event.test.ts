/**
 * Characterization / regression: async=true track must NOT insert an event
 * (or mutate balance) on the request path before the track queue worker runs.
 *
 * Context: we are seeing production events with empty/null deductions and
 * wanted to rule out "async track inserts the event optimistically before
 * processing".
 *
 * Expected (current) behavior:
 *  - POST /track async=true → 202 { success: true }
 *  - Immediately after: zero persisted events for the customer, balance unchanged
 *  - After worker + event batch flush: one event WITH deductions, balance reduced
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	events,
	type TrackParams,
} from "@autumn/shared";
import {
	eventsDb,
	getCustomerEvents,
} from "@tests/integration/balances/utils/events/getCustomerEvents.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { and, desc, eq } from "drizzle-orm";

const EVENT_BATCH_WAIT_MS = 4000;
const TRACK_VALUE = 7;
const INCLUDED_USAGE = 100;

test.concurrent(
	`${chalk.yellowBright("track-async: async=true does not insert an event before the track queue processes")}`,
	async () => {
		const customerId = `track-async-no-instant-event-${Date.now()}`;
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [free] }),
			],
			actions: [s.attach({ productId: free.id })],
		});

		const before = (await autumnV2_2.customers.get(
			customerId,
		)) as ApiCustomerV5;
		expectBalanceCorrect({
			customer: before,
			featureId: TestFeature.Messages,
			remaining: INCLUDED_USAGE,
			usage: 0,
			planId: free.id,
		});

		const trackParams = {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: TRACK_VALUE,
			async: true,
		} satisfies TrackParams;

		// Use raw fetch so we can assert HTTP 202 (AutumnInt.track swallows status).
		const response = await fetch(`${autumnV1["baseUrl"]}/track`, {
			method: "POST",
			headers: autumnV1["headers"],
			body: JSON.stringify(trackParams),
		});

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({ success: true });

		// ---- Immediate assertions: request path must not have written an event
		// or deducted balance. No sleep — this is the whole point of the test.
		const eventsImmediately = await getCustomerEvents({ customerId });
		expect(eventsImmediately).toHaveLength(0);

		const immediatelyAfter = (await autumnV2_2.customers.get(
			customerId,
		)) as ApiCustomerV5;
		expectBalanceCorrect({
			customer: immediatelyAfter,
			featureId: TestFeature.Messages,
			remaining: INCLUDED_USAGE,
			usage: 0,
			planId: free.id,
		});

		// ---- Eventually the track worker + event batcher should land the event
		// with deductions and apply the balance mutation.
		await timeout(EVENT_BATCH_WAIT_MS);

		const customer = (await autumnV2_2.customers.get(customerId, {
			with_autumn_id: true,
		})) as ApiCustomerV5 & { autumn_id?: string };
		const internalCustomerId = customer.autumn_id;
		expect(internalCustomerId).toBeDefined();

		const eventRows = await eventsDb()
			.select({
				id: events.id,
				event_name: events.event_name,
				value: events.value,
				deductions: events.deductions,
			})
			.from(events)
			.where(
				and(
					eq(events.org_id, ctx.org.id),
					eq(events.env, ctx.env),
					eq(events.internal_customer_id, internalCustomerId as string),
				),
			)
			.orderBy(desc(events.created_at))
			.limit(5);

		expect(eventRows.length).toBeGreaterThan(0);
		const latest = eventRows[0];
		expect(latest.value).toBe(TRACK_VALUE);
		expect(latest.event_name).toBe(TestFeature.Messages);
		expect(latest.deductions).not.toBeNull();
		expect(latest.deductions ?? []).toHaveLength(1);
		expect(latest.deductions?.[0]?.feature_id).toBe(TestFeature.Messages);
		expect(latest.deductions?.[0]?.value).toBe(TRACK_VALUE);

		const afterWorker = (await autumnV2_2.customers.get(
			customerId,
		)) as ApiCustomerV5;
		expectBalanceCorrect({
			customer: afterWorker,
			featureId: TestFeature.Messages,
			remaining: new Decimal(INCLUDED_USAGE).sub(TRACK_VALUE).toNumber(),
			usage: TRACK_VALUE,
			planId: free.id,
		});
	},
);
