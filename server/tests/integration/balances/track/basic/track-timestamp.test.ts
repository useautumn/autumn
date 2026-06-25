import { expect, test } from "bun:test";
import type { ApiEventsListResponse } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const TINYBIRD_INGEST_WAIT_MS = 3000;

test.concurrent(
	`${chalk.yellowBright("track timestamp: backdated timestamp is written to Tinybird events")}`,
	async () => {
		// Contract: track accepts timestamp?: number and emits that event timestamp.
		// Side effect: events.list reads the Tinybird event back with the same ms.
		const messagesItem = items.free({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		});
		const freeProd = products.base({
			id: "free",
			items: [messagesItem],
		});
		const runId = Date.now();
		const marker = `track-timestamp-${runId}`;

		const { customerId, autumnV1, autumnV2_2 } = await initScenario({
			customerId: marker,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const timestamp = Math.floor((Date.now() - 10_000) / 1000) * 1000;
		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 7,
			properties: { marker },
			timestamp,
		});

		let trackedEvent: ApiEventsListResponse["list"][number] | undefined;
		for (let attempt = 0; attempt < 5; attempt++) {
			await timeout(TINYBIRD_INGEST_WAIT_MS);
			const eventsList = (await autumnV1.post("/events/list", {
				customer_id: customerId,
				custom_range: {
					start: timestamp - 60_000,
					end: timestamp + 60_000,
				},
			})) as ApiEventsListResponse;
			trackedEvent = eventsList.list.find(
				(event) => event.properties?.marker === marker,
			);
			if (trackedEvent) break;
		}

		expect(trackedEvent).toBeDefined();
		expect(trackedEvent?.timestamp).toBe(timestamp);
		expect(trackedEvent?.feature_id).toBe(TestFeature.Messages);
		expect(trackedEvent?.value).toBe(7);
	},
);
