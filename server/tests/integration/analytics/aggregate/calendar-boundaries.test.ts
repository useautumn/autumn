import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { getTinybirdPipes } from "@/external/tinybird/initTinybird.js";
import { generateAllPeriods } from "@/internal/analytics/actions/aggregate.js";
import { generateId } from "@/utils/genUtils.js";

for (const { timezone, midnightMinute } of [
	{ timezone: "Asia/Kathmandu", midnightMinute: 15 },
	{ timezone: "Asia/Kolkata", midnightMinute: 30 },
]) {
	test(`aggregate calendar boundaries preserve raw-edge periods in ${timezone}`, async () => {
		const customerId = generateId("calendar_boundaries");
		const freeProduct = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const { autumnV2_4, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProduct], prefix: customerId }),
			],
			actions: [s.attach({ productId: freeProduct.id })],
		});
		const pipes = getTinybirdPipes();
		for (const { start, period, bins } of [
			{
				start: Date.UTC(2026, 2, 31, 18, midnightMinute),
				period: "2026-04-01 00:00:00",
				bins: ["day", "month"],
			},
			{
				start: Date.UTC(2026, 8, 13, 18, midnightMinute),
				period: "2026-09-14 00:00:00",
				bins: ["week"],
			},
		]) {
			await autumnV2_4.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 11,
				timestamp: start + 15 * 60_000,
				properties: { region: "eu" },
			});
			for (const binSize of bins) {
				const params = {
					org_id: ctx.org.id,
					env: ctx.env,
					customer_id: customerId,
					event_names: [TestFeature.Messages],
					start_date: new Date(start).toISOString().slice(0, 19),
					end_date: new Date(start + 29 * 60_000).toISOString().slice(0, 19),
					bin_size: binSize,
					timezone,
				};
				const deadline = Date.now() + 40_000;
				let simple: Awaited<ReturnType<typeof pipes.aggregateSimple>>;
				do {
					await timeout(3000);
					simple = await pipes.aggregateSimple(params);
				} while (simple.data.length === 0 && Date.now() < deadline);
				expect(simple.data).toEqual([
					{ period, event_name: TestFeature.Messages, total_value: 11 },
				]);
				expect(
					generateAllPeriods({
						startDate: params.start_date,
						endDate: params.end_date,
						binSize,
						timezone,
					}),
				).toContain(period);
				const grouped = await pipes.aggregateGroupable({
					...params,
					group_column: "property",
					property_key: "region",
				});
				expect(grouped.data).toHaveLength(1);
				expect(grouped.data[0]).toMatchObject({
					period,
					group_value: "eu",
					total_value: 11,
				});
				for (const propertyKey of [undefined, "region"]) {
					const deductions = await pipes.aggregateDeductions({
						...params,
						feature_ids: [TestFeature.Messages],
						property_key: propertyKey,
					});
					expect(deductions.data).toHaveLength(1);
					expect(deductions.data[0]).toMatchObject({ period, deducted: 11 });
				}
			}
		}
	});
}
