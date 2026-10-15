import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";

// kafkajs 2.2.4 gave up on a ListOffsets refused for a moved partition leader without refreshing
// metadata, which stopped a starting partition. Patched in patches/kafkajs@2.2.4.patch to refresh and retry.
const require = createRequire(import.meta.resolve("kafkajs"));
const createAdmin = require("./src/admin/index.js");
const { createErrorFromCode } = require("./src/protocol/error.js");

const LEADER_NOT_AVAILABLE = 5;
const NOT_LEADER_FOR_PARTITION = 6;
const TOPIC_AUTHORIZATION_FAILED = 29;

const topic = "tf-balance-local-ownership";

function createFixture({ failures }: { failures: number[] }) {
	const metadataRefreshes: number[] = [];
	const cluster = {
		addTargetTopic: async () => {},
		refreshMetadataIfNecessary: async () => {},
		refreshMetadata: async () => {
			metadataRefreshes.push(Date.now());
		},
		findTopicPartitionMetadata: () => [{ partitionId: 0 }],
		fetchTopicsOffset: async () => {
			const code = failures.shift();
			if (code !== undefined) throw createErrorFromCode(code);
			return [{ topic, partitions: [{ partition: 0, offset: "42" }] }];
		},
	};
	const logger = {
		namespace: () => logger,
		debug() {},
		info() {},
		warn() {},
		error() {},
	};
	const admin = createAdmin({
		logger,
		retry: { retries: 3, initialRetryTime: 1, maxRetryTime: 2 },
		cluster,
	});
	return { admin, metadataRefreshes };
}

describe("admin offsets read while a partition leader moves", () => {
	test.each([
		["NOT_LEADER_FOR_PARTITION", NOT_LEADER_FOR_PARTITION],
		["LEADER_NOT_AVAILABLE", LEADER_NOT_AVAILABLE],
	])(
		"%s refreshes metadata and retries fetchTopicOffsets",
		async (_type, code) => {
			const { admin, metadataRefreshes } = createFixture({ failures: [code] });

			const offsets = await admin.fetchTopicOffsets(topic);

			expect(offsets).toEqual([
				{ partition: 0, offset: "42", high: "42", low: "42" },
			]);
			expect(metadataRefreshes).toHaveLength(1);
		},
	);

	test("fetchTopicOffsetsByTimestamp retries a moved leader the same way", async () => {
		const { admin, metadataRefreshes } = createFixture({
			failures: [NOT_LEADER_FOR_PARTITION],
		});

		const offsets = await admin.fetchTopicOffsetsByTimestamp(topic, 1_000);

		expect(offsets).toEqual([{ partition: 0, offset: "42" }]);
		expect(metadataRefreshes).toHaveLength(1);
	});

	test("a refusal that is not about leadership still fails at once", async () => {
		const { admin, metadataRefreshes } = createFixture({
			failures: [TOPIC_AUTHORIZATION_FAILED],
		});

		await expect(admin.fetchTopicOffsets(topic)).rejects.toMatchObject({
			type: "TOPIC_AUTHORIZATION_FAILED",
		});
		expect(metadataRefreshes).toHaveLength(0);
	});
});
