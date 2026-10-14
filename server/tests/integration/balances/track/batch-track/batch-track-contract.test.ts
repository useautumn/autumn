import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type BatchTrackParams } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const testCase = "batch-track-contract";
const customerId = `test-${testCase}`;
const otherCustomerId = `test-${testCase}-2`;

const BATCH_TRACK_LIMIT_PER_SEC = 10;

type BatchTrackHttpResult = {
	status: number;
	body: unknown;
};

const postBatchTrack = async ({
	autumn,
	body,
	authorization,
}: {
	autumn: AutumnInt;
	body: unknown;
	authorization?: string | null;
}): Promise<BatchTrackHttpResult> => {
	const headers: Record<string, string> = {
		...autumn.headers,
		"Content-Type": "application/json",
	};
	if (authorization === null) {
		delete headers.Authorization;
	} else if (authorization !== undefined) {
		headers.Authorization = authorization;
	}

	const response = await fetch(`${autumn.baseUrl}/balances.batch_track`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});

	const text = await response.text();
	let parsed: unknown = null;
	if (text.length > 0) {
		try {
			parsed = JSON.parse(text);
		} catch {
			parsed = text;
		}
	}

	return { status: response.status, body: parsed };
};

const validItem = (
	overrides: Partial<{
		customer_id: string;
		feature_id: string;
		event_name: string;
		value: number;
		entity_id: string;
	}> = {},
) => ({
	customer_id: customerId,
	feature_id: TestFeature.Messages,
	value: 1,
	...overrides,
});

describe(chalk.yellowBright(testCase), () => {
	let autumn: AutumnInt;

	beforeAll(async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100_000 });
		const baseProduct = products.base({ id: "base", items: [messagesItem] });

		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [baseProduct] }),
			],
			actions: [s.attach({ productId: baseProduct.id })],
		});

		autumn = scenario.autumnV2_2;

		await scenario.autumnV1.customers.create({
			id: otherCustomerId,
			email: `${otherCustomerId}@test.com`,
			name: otherCustomerId,
		});
		await scenario.autumnV1.attach({
			customer_id: otherCustomerId,
			product_id: baseProduct.id,
		});

		await new Promise((resolve) => setTimeout(resolve, 1100));
	});

	test("valid single-item batch reaches the handler past validation/auth", async () => {
		const result = await postBatchTrack({
			autumn,
			body: [validItem()],
		});

		expect(isHandlerReached(result)).toBe(true);
		if (result.status === 204) {
			expect(result.body).toBeNull();
		}
	});

	test("valid mixed-customer multi-item batch reaches the handler past validation/auth", async () => {
		const body: BatchTrackParams = [
			validItem({ customer_id: customerId }),
			validItem({ customer_id: customerId, entity_id: "ent_a" }),
			validItem({ customer_id: otherCustomerId }),
		];

		const result = await postBatchTrack({ autumn, body });

		expect(isHandlerReached(result)).toBe(true);
		if (result.status === 204) {
			expect(result.body).toBeNull();
		}
	});

	const isValidationRejection = (status: number) =>
		status >= 400 && status < 500 && status !== 401 && status !== 429;

	const isHandlerReached = (result: BatchTrackHttpResult): boolean => {
		if (result.status === 200) {
			const body = result.body as { success?: unknown } | null;
			return body !== null && typeof body === "object" && body.success === true;
		}
		if (result.status === 204) return true;
		if (result.status === 503) {
			const body = result.body as { message?: unknown; code?: unknown } | null;
			return (
				body !== null &&
				typeof body === "object" &&
				body.code === "internal_error" &&
				body.message === "Async track is not available right now"
			);
		}
		return false;
	};

	test("validation rejects empty array (schema min(1))", async () => {
		const result = await postBatchTrack({ autumn, body: [] });
		expect(isValidationRejection(result.status)).toBe(true);
	});

	test("validation rejects 1001 items (schema max(1000))", async () => {
		const body = Array.from({ length: 1001 }, () => validItem());
		const result = await postBatchTrack({ autumn, body });
		expect(isValidationRejection(result.status)).toBe(true);
	});

	test("validation rejects an item missing both feature_id and event_name", async () => {
		const result = await postBatchTrack({
			autumn,
			body: [validItem(), { customer_id: customerId, value: 1 }],
		});
		expect(isValidationRejection(result.status)).toBe(true);
	});

	test("validation rejects an item providing BOTH feature_id and event_name (refine mutual-exclusion)", async () => {
		const result = await postBatchTrack({
			autumn,
			body: [
				{
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					event_name: "message.sent",
					value: 1,
				},
			],
		});
		expect(isValidationRejection(result.status)).toBe(true);
	});

	test("1000 items (upper boundary inclusive) passes validation — never 4xx schema reject", async () => {
		const body = Array.from({ length: 1000 }, () => validItem());
		const result = await postBatchTrack({ autumn, body });
		expect(isValidationRejection(result.status)).toBe(false);
		expect(isHandlerReached(result)).toBe(true);
	});

	test("V2_2 is the canonical client version for batchTrack (route matches under V2_2)", async () => {
		expect(autumn.headers["x-api-version"]).toBe(ApiVersion.V2_2);

		const result = await postBatchTrack({
			autumn,
			body: [validItem()],
		});
		expect(isHandlerReached(result)).toBe(true);
	});

	test("401 when no Authorization header is supplied", async () => {
		const result = await postBatchTrack({
			autumn,
			body: [validItem()],
			authorization: null,
		});

		expect(result.status).toBe(401);
		expect(result.body).toMatchObject({
			code: "no_secret_key",
		});
	});

	test("BatchTrack rate-limiter engages on burst past 10 req/sec/org", async () => {
		await new Promise((resolve) => setTimeout(resolve, 2100));

		const burstSize = BATCH_TRACK_LIMIT_PER_SEC * 3;
		const requests = Array.from({ length: burstSize }, () =>
			postBatchTrack({ autumn, body: [validItem()] }),
		);
		const results = await Promise.all(requests);

		const limited = results.filter((r) => r.status === 429).length;

		expect(limited).toBeGreaterThan(0);
	});

	test("Track still succeeds while BatchTrack is rate-limited (independent buckets)", async () => {
		const burst = Array.from({ length: BATCH_TRACK_LIMIT_PER_SEC * 3 }, () =>
			postBatchTrack({ autumn, body: [validItem()] }),
		);
		const burstResults = await Promise.all(burst);
		expect(burstResults.filter((r) => r.status === 429).length).toBeGreaterThan(
			0,
		);

		const trackResult = await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		expect(trackResult).toBeDefined();
	});
});
