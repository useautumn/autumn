import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const PROJECT_A = "30e8f7ae-2415-4ca7-bcc7-9139ebcd99bc";
const PROJECT_B = "2a625fb0-f627-41a9-8c38-a0d7ea985d65";
const PROJECT_A_VALUE = 30;
const PROJECT_B_VALUE = 12;

const EVENT_INGEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 3_000;

type AggregateResponse = {
	list: {
		period: number;
		values: Record<string, number>;
		grouped_values?: Record<string, Record<string, number>>;
	}[];
	total: Record<string, { count: number; sum: number }>;
};

const sumGroupValue = (
	response: AggregateResponse,
	featureId: string,
	groupValue: string,
): number =>
	response.list.reduce(
		(sum, row) => sum + (row.grouped_values?.[featureId]?.[groupValue] ?? 0),
		0,
	);

test.concurrent(
	`${chalk.yellowBright("aggregate uuid-group-by: group_by on a UUID-valued property returns grouped data")}`,
	async () => {
		const customerId = `aggregate-uuid-group-by-${Date.now()}`;
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({ id: "free", items: [messagesItem] });

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd], prefix: customerId }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: PROJECT_A_VALUE,
			properties: { project_id: PROJECT_A },
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: PROJECT_B_VALUE,
			properties: { project_id: PROJECT_B },
		});

		const deadline = Date.now() + EVENT_INGEST_TIMEOUT_MS;
		let response: AggregateResponse;
		do {
			await timeout(POLL_INTERVAL_MS);
			response = (await autumnV2_2.events.aggregate({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				group_by: "properties.project_id",
				range: "7d",
			})) as AggregateResponse;
		} while (
			Date.now() < deadline &&
			sumGroupValue(response, TestFeature.Messages, PROJECT_A) !==
				PROJECT_A_VALUE
		);

		expect(response.total[TestFeature.Messages]?.sum).toBe(
			PROJECT_A_VALUE + PROJECT_B_VALUE,
		);

		expect(response.list.length).toBeGreaterThan(0);
		expect(sumGroupValue(response, TestFeature.Messages, PROJECT_A)).toBe(
			PROJECT_A_VALUE,
		);
		expect(sumGroupValue(response, TestFeature.Messages, PROJECT_B)).toBe(
			PROJECT_B_VALUE,
		);
	},
);
