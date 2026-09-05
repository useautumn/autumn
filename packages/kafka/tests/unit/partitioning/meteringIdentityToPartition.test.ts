import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { meteringPartitionKeyOf } from "@autumn/balance-engine";
import { meteringIdentityToPartition } from "../../../src/partitioning/meteringIdentityToPartition.js";

const require = createRequire(import.meta.url);
const murmur2 =
	require("kafkajs/src/producer/partitioners/default/murmur2.js") as (
		key: Buffer,
	) => number;

const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
} as const;

function matchesKafkaDefaultPartitioner(): void {
	const key = Buffer.from(meteringPartitionKeyOf({ identity }), "utf8");
	const kafkaPartition = (murmur2(key) & 0x7fffffff) % 32;

	expect(meteringIdentityToPartition({ identity, partitionCount: 32 })).toBe(
		kafkaPartition,
	);
}

function keepsStablePartition(): void {
	expect(meteringIdentityToPartition({ identity, partitionCount: 16 })).toBe(
		meteringIdentityToPartition({ identity, partitionCount: 16 }),
	);
}

function rejectsInvalidPartitionCount(): void {
	function resolveInvalidPartition(): void {
		meteringIdentityToPartition({ identity, partitionCount: 0 });
	}
	expect(resolveInvalidPartition).toThrow("partitionCount");
}

test(
	"matches KafkaJS DefaultPartitioner for the customer key",
	matchesKafkaDefaultPartitioner,
);
test("is stable for the same identity and count", keepsStablePartition);
test("rejects an invalid partition count", rejectsInvalidPartitionCount);
