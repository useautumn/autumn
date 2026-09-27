import { expect, test } from "bun:test";

const CONSTANTS_MODULE = new URL("./balanceWorkerConstants.ts", import.meta.url)
	.pathname;

// The deployed count only applies outside the local stack, so read it from a
// process that is not running under the test environment.
function partitionCountFor({ nodeEnv }: { nodeEnv: string }): number {
	const result = Bun.spawnSync(
		[
			process.execPath,
			"-e",
			`const { BALANCE_WORKER_PARTITION_COUNT } = await import(${JSON.stringify(CONSTANTS_MODULE)}); console.log(BALANCE_WORKER_PARTITION_COUNT);`,
		],
		{ env: { ...process.env, NODE_ENV: nodeEnv } },
	);
	return Number(result.stdout.toString().trim());
}

test("deployed workers route over 64 partitions", () => {
	expect(partitionCountFor({ nodeEnv: "production" })).toBe(64);
});

test("the local stack keeps its small partition count", () => {
	expect(partitionCountFor({ nodeEnv: "development" })).toBe(4);
});
