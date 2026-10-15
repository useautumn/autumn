import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";

// kafkajs 2.2.4 rejoined on a heartbeat answered for a generation this member had already left,
// which started yet another generation. Patched in patches/kafkajs@2.2.4.patch to drop such answers.
const require = createRequire(import.meta.resolve("kafkajs"));
const ConsumerGroup = require("./src/consumer/consumerGroup.js");
const { createErrorFromCode } = require("./src/protocol/error.js");

const ILLEGAL_GENERATION = 22;
const REBALANCE_IN_PROGRESS = 27;

type Heartbeat = (params: {
	group: { generationId: number };
	payload: { groupGenerationId: number };
}) => Promise<void>;

function createGroup({
	heartbeat,
	findGroupCoordinator = async () => ({}),
}: {
	heartbeat: Heartbeat;
	findGroupCoordinator?: () => Promise<unknown>;
}) {
	const logger = {
		namespace: () => logger,
		debug() {},
		info() {},
		warn() {},
		error() {},
	};
	const sent: number[] = [];
	const group = new ConsumerGroup({
		retry: { retries: 0 },
		cluster: { findGroupCoordinator },
		groupId: "balance-workers",
		topics: ["events"],
		topicConfigurations: {},
		logger,
		instrumentationEmitter: { emit() {} },
		assigners: [],
	});
	group.memberId = "balance-worker-1";
	group.generationId = 7;
	group.coordinator = {
		heartbeat: (payload: { groupGenerationId: number }) => {
			sent.push(payload.groupGenerationId);
			return heartbeat({ group, payload });
		},
	};
	return { group, sent };
}

describe("heartbeat answers the group has already moved past", () => {
	test("ILLEGAL_GENERATION for a generation this member already left is dropped", async () => {
		const { group, sent } = createGroup({
			heartbeat: async ({ group }) => {
				group.generationId = 8;
				throw createErrorFromCode(ILLEGAL_GENERATION);
			},
		});

		await group.heartbeat({ interval: 0 });
		// The dropped answer still counts as this interval's heartbeat.
		await group.heartbeat({ interval: 60_000 });

		expect(sent).toEqual([7]);
	});

	test("ILLEGAL_GENERATION for the member's current generation still surfaces", async () => {
		const { group } = createGroup({
			heartbeat: async () => {
				throw createErrorFromCode(ILLEGAL_GENERATION);
			},
		});

		await expect(group.heartbeat({ interval: 0 })).rejects.toMatchObject({
			type: "ILLEGAL_GENERATION",
		});
	});

	test("REBALANCE_IN_PROGRESS outside a join still surfaces, so the runner rejoins", async () => {
		const { group } = createGroup({
			heartbeat: async () => {
				throw createErrorFromCode(REBALANCE_IN_PROGRESS);
			},
		});

		await expect(group.heartbeat({ interval: 0 })).rejects.toMatchObject({
			type: "REBALANCE_IN_PROGRESS",
		});
	});

	test("REBALANCE_IN_PROGRESS while this member is already rejoining is dropped", async () => {
		const lookup = Promise.withResolvers<unknown>();
		const { group } = createGroup({
			heartbeat: async () => {
				throw createErrorFromCode(REBALANCE_IN_PROGRESS);
			},
			findGroupCoordinator: () => lookup.promise,
		});

		const joining = group.joinAndSync();
		await group.heartbeat({ interval: 0 });

		lookup.reject(new Error("coordinator lookup failed"));
		await expect(joining).rejects.toThrow("coordinator lookup failed");
		await expect(group.heartbeat({ interval: 0 })).rejects.toMatchObject({
			type: "REBALANCE_IN_PROGRESS",
		});
	});
});
