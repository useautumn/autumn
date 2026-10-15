import { expect, test } from "bun:test";
import { createRequire } from "node:module";

// kafkajs 2.2.4 rejoins the group after a fetch finds stale leadership, so every
// leader election restarts an eager rebalance for the whole group. Patched in
// patches/kafkajs@2.2.4.patch to refresh metadata only, as the Java client does.
const require = createRequire(import.meta.resolve("kafkajs"));
const ConsumerGroup = require("./src/consumer/consumerGroup.js");

function createFixture() {
	const calls: string[] = [];
	const group = Object.create(ConsumerGroup.prototype);
	Object.assign(group, {
		groupId: "workers",
		memberId: "member-1",
		logger: { debug() {}, info() {}, warn() {}, error() {} },
		cluster: {
			refreshMetadata: async () => {
				calls.push("refreshMetadata");
			},
		},
		joinAndSync: async () => {
			calls.push("joinAndSync");
		},
	});
	return { group, calls };
}

for (const type of [
	"NOT_LEADER_FOR_PARTITION",
	"LEADER_NOT_AVAILABLE",
	"FENCED_LEADER_EPOCH",
	"UNKNOWN_LEADER_EPOCH",
	"UNKNOWN_TOPIC_OR_PARTITION",
]) {
	test(`a fetch refused with ${type} refreshes metadata without rejoining`, async () => {
		const { group, calls } = createFixture();
		await group.recoverFromFetch(Object.assign(new Error(type), { type }));
		expect(calls).toEqual(["refreshMetadata"]);
	});
}

test("a partition count change still rejoins to be assigned the new partitions", async () => {
	const { group, calls } = createFixture();
	await group.recoverFromFetch(
		Object.assign(new Error("stale assignment"), {
			name: "KafkaJSStaleTopicMetadataAssignment",
			topic: "events",
			unknownPartitions: [128],
		}),
	);
	expect(calls).toEqual(["joinAndSync"]);
});
