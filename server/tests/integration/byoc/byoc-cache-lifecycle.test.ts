/**
 * byoc.create_cache / get_cache / delete_cache against the local `alien dev` manager:
 * - create provisions straight away locally (no setup link), then get polls it to ready;
 * - a second create returns the same deployment instead of starting another;
 * - delete forgets it, and get then answers null.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ByocCacheStatus } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";

const apiBase = `${(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")}/v1`;
const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;

const postByoc = async ({ route }: { route: string }) => {
	const res = await fetch(`${apiBase}/byoc.${route}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${defaultCtx.orgSecretKey}`,
			"Content-Type": "application/json",
		},
		body: "{}",
	});
	// biome-ignore lint/suspicious/noExplicitAny: response shapes vary per route
	return { status: res.status, body: (await res.json()) as any };
};

const waitForReadyCache = async () => {
	const deadline = Date.now() + READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const { body } = await postByoc({ route: "get_cache" });
		if (body.cache?.status === ByocCacheStatus.Ready) return body.cache;
		expect(body.cache?.status).not.toBe(ByocCacheStatus.Failed);
		await Bun.sleep(POLL_INTERVAL_MS);
	}
	throw new Error(`cache not ready within ${READY_TIMEOUT_MS}ms`);
};

beforeAll(async () => {
	await postByoc({ route: "delete_cache" });
});

afterAll(async () => {
	await postByoc({ route: "delete_cache" });
});

describe("byoc cache lifecycle", () => {
	test(
		"create → ready → create again is a no-op → delete → gone",
		async () => {
			const created = await postByoc({ route: "create_cache" });
			expect(created.status).toBe(200);
			expect(created.body.env).toBe("sandbox");
			expect(created.body.setup_url).toBeNull();
			expect([ByocCacheStatus.Provisioning, ByocCacheStatus.Ready]).toContain(
				created.body.status,
			);

			const ready = await waitForReadyCache();
			expect(ready.deployment_id).toBeString();

			const again = await postByoc({ route: "create_cache" });
			expect(again.status).toBe(200);
			expect(again.body.deployment_id).toBe(ready.deployment_id);
			expect(again.body.status).toBe(ByocCacheStatus.Ready);

			const deleted = await postByoc({ route: "delete_cache" });
			expect(deleted.body).toEqual({ success: true });

			const afterDelete = await postByoc({ route: "get_cache" });
			expect(afterDelete.body).toEqual({ cache: null });
		},
		READY_TIMEOUT_MS + 10_000,
	);
});
