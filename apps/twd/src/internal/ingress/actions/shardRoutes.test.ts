import { afterEach, expect, mock, test } from "bun:test";
import { forwardConnectEvent } from "./forwardConnectEvent.ts";
import {
	clearShardRoutesForRun,
	deleteIngressRoute,
	setIngressRoute,
	setShardRoute,
} from "./ingressRoutes.ts";

const logger = { warn: () => {}, error: () => {}, info: () => {} } as never;
const realFetch = globalThis.fetch;
const forwardedTo: string[] = [];

const fakeFetch = mock(async (url: string | URL | Request) => {
	forwardedTo.push(String(url));
	return new Response("ok");
});

afterEach(() => {
	globalThis.fetch = realFetch;
	forwardedTo.length = 0;
	clearShardRoutesForRun({ runId: "run_a" });
	clearShardRoutesForRun({ runId: "run_b" });
	deleteIngressRoute({ accountId: "acct_pool" });
});

const deliver = ({ account, shard }: { account: string; shard?: string }) => {
	globalThis.fetch = fakeFetch as never;
	return forwardConnectEvent({
		rawBody: JSON.stringify({
			id: "evt_1",
			type: "account.application.deauthorized",
			account,
		}),
		headers: new Headers(),
		env: "sandbox",
		shard,
		logger,
	});
};

test("shard-endpoint events for accounts no worker registered reach the stripe-connect worker", async () => {
	setShardRoute({
		shard: "stripe-connect",
		workerUrl: "https://shard.worker",
		runId: "run_a",
	});
	expect(
		await deliver({ account: "acct_test_created", shard: "stripe-connect" }),
	).toBe(200);
	expect(forwardedTo).toEqual([
		"https://shard.worker/webhooks/connect/sandbox",
	]);
});

test("pool-endpoint events for unknown accounts are still acked and dropped", async () => {
	setShardRoute({
		shard: "stripe-connect",
		workerUrl: "https://shard.worker",
		runId: "run_a",
	});
	expect(await deliver({ account: "acct_test_created" })).toBe(200);
	expect(forwardedTo).toEqual([]);
});

test("a registered account keeps its own worker on the shard endpoint", async () => {
	setShardRoute({
		shard: "stripe-connect",
		workerUrl: "https://shard.worker",
		runId: "run_a",
	});
	setIngressRoute({ accountId: "acct_pool", workerUrl: "https://pool.worker" });
	await deliver({ account: "acct_pool", shard: "stripe-connect" });
	expect(forwardedTo).toEqual(["https://pool.worker/webhooks/connect/sandbox"]);
});

test("a finished run only clears the shard route it still owns", async () => {
	setShardRoute({
		shard: "stripe-connect",
		workerUrl: "https://a.worker",
		runId: "run_a",
	});
	setShardRoute({
		shard: "stripe-connect",
		workerUrl: "https://b.worker",
		runId: "run_b",
	});
	clearShardRoutesForRun({ runId: "run_a" });
	await deliver({ account: "acct_x", shard: "stripe-connect" });
	expect(forwardedTo).toEqual(["https://b.worker/webhooks/connect/sandbox"]);
	clearShardRoutesForRun({ runId: "run_b" });
	forwardedTo.length = 0;
	expect(await deliver({ account: "acct_x", shard: "stripe-connect" })).toBe(
		200,
	);
	expect(forwardedTo).toEqual([]);
});
