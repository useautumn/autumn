import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { TESTS_DIR } from "../../catalog/repoPaths.ts";
import { countPooledFiles } from "./countPooledFiles.ts";
import { acquireStripeConnectLease } from "./stripeConnectLease.ts";

test("stripe-connect files never count toward the pool accounts a run asks for", async () => {
	const testIds = [
		"integration/platform/platform-stripe-rpc.test.ts",
		"integration/stripe/oauth-callback.test.ts",
		"integration/stripe/oauth-deauthorization.test.ts",
	];
	expect(await countPooledFiles({ testIds, testsDirAtSha: TESTS_DIR })).toBe(0);
	expect(
		await countPooledFiles({
			testIds: [
				...testIds,
				"integration/billing/attach/attach-metadata.test.ts",
			],
			testsDirAtSha: resolve(TESTS_DIR),
		}),
	).toBe(1);
});

test("only one run holds the stripe-connect shard at a time", async () => {
	const order: string[] = [];
	const releaseA = await acquireStripeConnectLease();
	const waitingB = acquireStripeConnectLease().then((release) => {
		order.push("b");
		return release;
	});
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
});
