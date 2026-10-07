import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { TESTS_DIR } from "../../catalog/repoPaths.ts";
import { partitionPooledShards } from "./partitionPooledShards.ts";
import { acquireStripeConnectLease } from "./stripeConnectLease.ts";

test("stripe-connect files never count toward the pool accounts a run asks for", async () => {
	const testIds = [
		"integration/platform/platform-stripe-rpc.test.ts",
		"integration/stripe/oauth-callback.test.ts",
		"integration/stripe/oauth-deauthorization.test.ts",
	];
	expect(
		await partitionPooledShards({ testIds, testsDirAtSha: TESTS_DIR }),
	).toEqual([]);
	expect(
		await partitionPooledShards({
			testIds: [
				...testIds,
				"integration/billing/attach/attach-metadata.test.ts#1",
				"integration/billing/attach/attach-metadata.test.ts#2",
			],
			testsDirAtSha: resolve(TESTS_DIR),
		}),
	).toEqual([
		{
			key: "main",
			files: [
				"integration/billing/attach/attach-metadata.test.ts#1",
				"integration/billing/attach/attach-metadata.test.ts#2",
			],
		},
	]);
});

test("only one run holds the stripe-connect shard at a time", async () => {
	const order: string[] = [];
	const releaseA = await acquireStripeConnectLease();
	const waitingB = acquireStripeConnectLease().then((release) => {
		order.push("b");
		return release;
	});
	try {
		await Bun.sleep(5);
		expect(order).toEqual([]);
		order.push("a done");
		releaseA();
		const releaseB = await waitingB;
		expect(order).toEqual(["a done", "b"]);
		releaseB();
		releaseB();
		const releaseC = await acquireStripeConnectLease();
		releaseC();
	} finally {
		releaseA();
		void waitingB.then((release) => release());
	}
});
