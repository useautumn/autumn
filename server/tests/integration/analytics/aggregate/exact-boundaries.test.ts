import { expect, test } from "bun:test";
import type { EventsAggregateParams } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { generateId } from "@/utils/genUtils.js";

const events = [
	{ at: Date.UTC(2026, 5, 15, 21, 1), value: 7, region: "us" },
	{ at: Date.UTC(2026, 5, 15, 21, 2, 29), value: 11, region: "eu" },
	{ at: Date.UTC(2026, 5, 15, 21, 30), value: 13, region: "us" },
	{ at: Date.UTC(2026, 5, 15, 22, 15), value: 17, region: "eu" },
	{ at: Date.UTC(2026, 5, 16, 12), value: 19, region: "us" },
	{ at: Date.UTC(2026, 5, 17, 0, 15), value: 23, region: "eu" },
	{ at: Date.UTC(2026, 5, 17, 0, 45), value: 29, region: "us" },
	{ at: Date.UTC(2026, 6, 12, 12), value: 31, region: "us" },
	{ at: Date.UTC(2026, 7, 10, 0, 15), value: 37, region: "eu" },
	{ at: Date.UTC(2026, 7, 10, 0, 45), value: 41, region: "us" },
];

type AggregateResponse = {
	list: {
		period: number;
		values: Record<string, number>;
		grouped_values?: Record<string, Record<string, number>>;
	}[];
	total: Record<string, { count: number; sum: number }>;
	deductions?: {
		period: number;
		values: Record<string, { deducted: number; events: number }>;
	}[];
};

test("aggregate exact timestamp boundaries preserve totals and grouped bins", async () => {
	const customerId = generateId("aggregate_boundaries");
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

	const deadline = Date.now() + 40_000;
	let ingestedCount = 0;
	do {
		await timeout(3000);
		const response = (await autumnV2_4.events.aggregate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			custom_range: {
				start: Date.UTC(2026, 5, 15),
				end: Date.UTC(2026, 7, 11),
			},
		})) as AggregateResponse;
		ingestedCount = response.total[TestFeature.Messages]?.count ?? 0;
	} while (ingestedCount !== events.length && Date.now() < deadline);
	expect(ingestedCount).toBe(events.length);

	const windows = [
		{
			start: Date.UTC(2026, 5, 15, 21, 2, 29),
			end: Date.UTC(2026, 5, 15, 22, 30),
		},
		{ start: Date.UTC(2026, 5, 15, 21), end: Date.UTC(2026, 5, 15, 21, 15) },
		{
			start: Date.UTC(2026, 5, 15, 21, 10),
			end: Date.UTC(2026, 5, 15, 21, 40),
		},
		{ start: Date.UTC(2026, 5, 15, 21), end: Date.UTC(2026, 5, 15, 22) },
		{
			start: Date.UTC(2026, 5, 15, 21),
			end: Date.UTC(2026, 5, 15, 22, 59, 59),
		},
		{
			start: Date.UTC(2026, 5, 15, 21, 2, 29),
			end: Date.UTC(2026, 5, 17, 0, 30),
		},
		{
			start: Date.UTC(2026, 5, 15, 21, 2, 29),
			end: Date.UTC(2026, 7, 10, 0, 30),
		},
		{
			start: Date.UTC(2026, 5, 15, 21, 2, 29),
			end: Date.UTC(2026, 5, 15, 21, 2, 30),
		},
	];

	for (const window of windows) {
		for (const binSize of ["hour", "day", "month"] as const) {
			for (const filtered of [false, true]) {
				const included = events.filter(
					(event) =>
						event.at >= window.start &&
						event.at <= window.end &&
						(!filtered || event.region === "us"),
				);
				const expectedSum = included.reduce(
					(sum, event) => sum + event.value,
					0,
				);
				for (const groupBy of [undefined, "properties.region"]) {
					const params: EventsAggregateParams = {
						customer_id: customerId,
						feature_id: TestFeature.Messages,
						custom_range: window,
						bin_size: binSize,
						group_by: groupBy,
						filter_by: filtered ? { region: "us" } : undefined,
						aggregate_on: filtered ? undefined : "deducted",
					};
					const response = (await autumnV2_4.events.aggregate(
						params,
					)) as AggregateResponse;
					expect(response.total[TestFeature.Messages]?.sum ?? 0).toBe(
						expectedSum,
					);
					expect(response.total[TestFeature.Messages]?.count ?? 0).toBe(
						included.length,
					);
					expect(
						response.list.reduce(
							(sum, row) => sum + (row.values[TestFeature.Messages] ?? 0),
							0,
						),
					).toBe(expectedSum);
					if (!filtered) {
						expect(response.deductions).toBeDefined();
						expect(
							response.deductions?.reduce(
								(sum, row) =>
									sum + (row.values[TestFeature.Messages]?.deducted ?? 0),
								0,
							),
						).toBe(expectedSum);
					}
					if (!groupBy) continue;
					for (const region of ["us", "eu"]) {
						const expectedGroup = included.reduce(
							(sum, event) => sum + (event.region === region ? event.value : 0),
							0,
						);
						expect(
							response.list.reduce(
								(sum, row) =>
									sum +
									(row.grouped_values?.[TestFeature.Messages]?.[region] ?? 0),
								0,
							),
						).toBe(expectedGroup);
					}
				}
			}
		}
	}
});
