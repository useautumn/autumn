/**
 * A follower store applies raw bodies the primary fetched, so applyRaw and
 * markFailed must behave exactly like refresh does on the same S3 outcome.
 *
 * Contract:
 *   - applyRaw(valid) serves the parsed config and reports healthy; null or an
 *     empty body serves defaultValue and reports healthy (like NoSuchKey).
 *   - applyRaw(invalid JSON / schema mismatch) keeps the last good config and
 *     reports the same unhealthy status and error as refresh on that body.
 *   - markFailed keeps the last good config, reports unhealthy, and logs once
 *     per distinct error (same de-duplication as refresh).
 */

import { describe, expect, jest, test } from "bun:test";
import type { S3Client } from "@aws-sdk/client-s3";
import { z } from "zod/v4";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import { createFakeLogger } from "./utils/fakeLogger.js";

const TestSchema = z.object({ count: z.number() });
const defaultValue = () => ({ count: 0 });

const createStore = ({ body }: { body?: () => string } = {}) => {
	const s3Client = {
		send: jest.fn(async () => ({
			Body: { transformToString: async () => body?.() ?? "" },
		})),
	} as unknown as S3Client;
	return createEdgeConfigStore({
		s3Key: "admin/apply-raw.json",
		schema: TestSchema,
		defaultValue,
		s3Client,
		follower: null,
	});
};

const statusWithoutTimes = (store: ReturnType<typeof createStore>) => {
	const {
		lastFetchAt: _fetch,
		lastSuccessAt: _success,
		...status
	} = store.getStatus();
	return status;
};

describe("edge config store applyRaw / markFailed", () => {
	test("applyRaw serves a valid body and falls back to default on a missing one", () => {
		const store = createStore();

		store.applyRaw({ raw: '{"count":3}' });
		expect(store.get()).toEqual({ count: 3 });
		expect(store.getStatus()).toMatchObject({
			configured: true,
			healthy: true,
		});
		expect(store.getStatus().lastSuccessAt).toBeDefined();

		// null = NoSuchKey / empty object on S3
		store.applyRaw({ raw: null });
		expect(store.get()).toEqual(defaultValue());
		expect(store.getStatus().healthy).toBe(true);

		store.applyRaw({ raw: '{"count":4}' });
		store.applyRaw({ raw: "   " });
		expect(store.get()).toEqual(defaultValue());
		expect(store.getStatus().healthy).toBe(true);
	});

	test("applyRaw on a bad body keeps the last good config, exactly like refresh", async () => {
		for (const badBody of ["{not json", '{"count":"three"}']) {
			let body = '{"count":7}';
			const refreshed = createStore({ body: () => body });
			const applied = createStore();

			await refreshed.refresh();
			applied.applyRaw({ raw: '{"count":7}' });

			body = badBody;
			await refreshed.refresh();
			applied.applyRaw({ raw: badBody });

			expect(applied.get()).toEqual({ count: 7 });
			expect(applied.getStatus().healthy).toBe(false);
			expect(statusWithoutTimes(applied)).toEqual(
				statusWithoutTimes(refreshed),
			);
		}
	});

	test("markFailed keeps the last good config and logs once per distinct error", () => {
		const store = createStore();
		const logger = createFakeLogger();
		store.applyRaw({ raw: '{"count":5}' });

		store.markFailed({ error: new Error("503 SlowDown"), logger });
		store.markFailed({ error: new Error("503 SlowDown"), logger });
		expect(store.get()).toEqual({ count: 5 });
		expect(store.getStatus()).toMatchObject({
			healthy: false,
			error: "503 SlowDown",
		});
		expect(logger.warn).toHaveBeenCalledTimes(1);

		store.markFailed({ error: new Error("AccessDenied"), logger });
		expect(logger.warn).toHaveBeenCalledTimes(2);
		expect(store.getStatus().error).toBe("AccessDenied");
	});
});
