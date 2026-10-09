import { expect, test } from "bun:test";
import type { EventsAggregateParams } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { generateId } from "@/utils/genUtils.js";

// Values deliberately differ from 1 so a count can't pass by coincidence with the sum.
const events = [
	{ at: Date.UTC(2026, 5, 15, 9), value: 7, region: "us" },
	{ at: Date.UTC(2026, 5, 15, 10, 30), value: 0.5, region: "eu" },
	{ at: Date.UTC(2026, 5, 15, 23, 59), value: 0, region: "us" },
	{ at: Date.UTC(2026, 5, 16, 0, 1), value: 13, region: "eu" },
	{ at: Date.UTC(2026, 5, 16, 12), value: 19, region: "eu" },
	{ at: Date.UTC(2026, 5, 17, 6), value: 23, region: "us" },
];
const window = { start: Date.UTC(2026, 5, 15), end: Date.UTC(2026, 5, 18) };
const EVENTS_REQUEST_SPACING_MS = 250;

type AggregateResponse = {
	list: {
		period: number;
		values: Record<string, number>;
		grouped_values?: Record<string, Record<string, number>>;
	}[];
	total: Record<string, { count: number; sum: number }>;
};

const dayStart = (at: number) => Math.floor(at / 86_400_000) * 86_400_000;

test("aggregate measure count returns per-bin event counts, ungrouped and grouped", async () => {
	const customerId = generateId("aggregate_count");
	const freeProduct = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});
	const { autumnV2_4 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProduct], prefix: customerId }),
		],
		actions: [s.attach({ productId: freeProduct.id })],
	});

	for (const event of events) {
		await autumnV2_4.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: event.value,
			timestamp: event.at,
			properties: { region: event.region },
		});
	}

	const aggregate = async (params: Partial<EventsAggregateParams>) => {
		await timeout(EVENTS_REQUEST_SPACING_MS);
		return (await autumnV2_4.events.aggregate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			custom_range: window,
			bin_size: "day",
			...params,
		})) as AggregateResponse;
	};

	const deadline = Date.now() + 40_000;
	let ingestedCount = 0;
	do {
		await timeout(3000);
		const response = await aggregate({});
		ingestedCount = response.total[TestFeature.Messages]?.count ?? 0;
	} while (ingestedCount !== events.length && Date.now() < deadline);
	expect(ingestedCount).toBe(events.length);

	const expectedPerDay = ({ region }: { region?: string }) => {
		const counts = new Map<number, number>();
		for (const event of events) {
			if (region && event.region !== region) continue;
			const day = dayStart(event.at);
			counts.set(day, (counts.get(day) ?? 0) + 1);
		}
		return counts;
	};

	const ungrouped = await aggregate({ measure: "count" });
	for (const row of ungrouped.list) {
		expect(row.values[TestFeature.Messages] ?? 0).toBe(
			expectedPerDay({}).get(row.period) ?? 0,
		);
	}
	expect(ungrouped.total[TestFeature.Messages]).toEqual({
		count: events.length,
		sum: events.reduce((sum, event) => sum + event.value, 0),
	});

	const grouped = await aggregate({
		measure: "count",
		group_by: "properties.region",
	});
	for (const row of grouped.list) {
		for (const region of ["us", "eu"]) {
			expect(row.grouped_values?.[TestFeature.Messages]?.[region] ?? 0).toBe(
				expectedPerDay({ region }).get(row.period) ?? 0,
			);
		}
	}

	const filtered = await aggregate({
		measure: "count",
		filter_by: { region: "eu" },
	});
	for (const row of filtered.list) {
		expect(row.values[TestFeature.Messages] ?? 0).toBe(
			expectedPerDay({ region: "eu" }).get(row.period) ?? 0,
		);
	}

	const summed = await aggregate({});
	expect(
		summed.list.reduce(
			(sum, row) => sum + (row.values[TestFeature.Messages] ?? 0),
			0,
		),
	).toBe(events.reduce((sum, event) => sum + event.value, 0));
});
