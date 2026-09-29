import { expect, test } from "bun:test";
import type { SlotGateDescription } from "@autumn/blue-green";
import type { EdgeConfigS3Client } from "@autumn/edge-config";
import { createHeraldHeartbeat } from "../../../src/slot/heraldHeartbeat.js";
import { createHeraldReadinessProbes } from "../../../src/slot/heraldReadinessProbes.js";
import {
	HeraldHeartbeatSchema,
	type JobHealth,
} from "../../../src/slot/types/heraldHeartbeat.js";

const ours = "arn:aws:ecs:us-east-2:1:service/autumn/herald-green";

const createHarness = ({
	gate,
	jobs,
	storeHealthy = true,
	failing = new Set<string>(),
}: {
	gate: SlotGateDescription;
	jobs: JobHealth[];
	storeHealthy?: boolean;
	failing?: Set<string>;
}) => {
	const written: { key: string; body: unknown }[] = [];
	const s3Client: EdgeConfigS3Client = {
		send: async (command) => {
			const { Key, Body } = command.input as { Key: string; Body: string };
			written.push({ key: Key, body: JSON.parse(Body) });
			return {};
		},
	};
	const probe = (name: string) => async () => {
		if (failing.has(name)) throw new Error(`${name} refused`);
	};
	const heartbeat = createHeraldHeartbeat({
		ctx: {
			s3Client,
			location: { bucket: "autumn-test-server", region: "us-east-2" },
			gate: { describe: () => gate },
			readJobs: () => jobs,
			readStoreHealthy: () => storeHealthy,
			probes: {
				kafka: probe("kafka"),
				eventsDb: probe("eventsDb"),
				miscCache: probe("miscCache"),
			},
			schedule: () => () => {},
		},
		config: {
			deployment: "staging",
			fleetId: "1a2b3c4d",
			identity: { serviceArn: ours, imageSha: "abc123" },
		},
	});
	return { heartbeat, written };
};

const job = (overrides: Partial<JobHealth>): JobHealth => ({
	name: "usage-events",
	membership: "joined",
	partitions: 16,
	maxLagRecords: 3,
	...overrides,
});

test("an idle task writes an ok heartbeat under the fleet's prefix with every job out of its group", async () => {
	const { heartbeat, written } = createHarness({
		gate: { active: false, reason: "idle", expectedServiceArn: "arn:blue" },
		jobs: [
			job({ membership: "idle", partitions: 0, maxLagRecords: null }),
			job({
				name: "balance-webhooks",
				membership: "idle",
				partitions: 0,
				maxLagRecords: null,
			}),
		],
	});
	await heartbeat.start();
	expect(written).toHaveLength(1);
	const [{ key, body }] = written;
	const parsed = HeraldHeartbeatSchema.parse(body);
	expect(key).toBe(
		`admin/blue-green-heartbeats/herald/1a2b3c4d/${parsed.instanceId}.json`,
	);
	expect(parsed).toMatchObject({
		serviceName: "herald",
		fleetId: "1a2b3c4d",
		deployment: "staging",
		identity: { serviceArn: ours, imageSha: "abc123" },
		declaredActive: false,
		gate: "idle",
		storeHealthy: true,
		ok: true,
		checks: {
			kafka: { ok: true },
			eventsDb: { ok: true },
			miscCache: { ok: true },
		},
		jobs: { total: 2, joined: 0 },
	});
});

test("an active task reports how many jobs joined and their lag", async () => {
	const { heartbeat, written } = createHarness({
		gate: { active: true, reason: "active" },
		jobs: [
			job({}),
			job({ name: "auto-topups", membership: "joining", partitions: 0 }),
		],
	});
	await heartbeat.start();
	expect(HeraldHeartbeatSchema.parse(written[0]?.body)).toMatchObject({
		declaredActive: true,
		gate: "active",
		jobs: {
			total: 2,
			joined: 1,
			byJob: [
				{ name: "usage-events", membership: "joined", maxLagRecords: 3 },
				{ name: "auto-topups", membership: "joining" },
			],
		},
	});
});

test("a failing probe, or an unreadable slot record, makes the heartbeat not ok; the write still lands", async () => {
	const probeFailed = createHarness({
		gate: { active: true, reason: "active" },
		jobs: [],
		failing: new Set(["eventsDb"]),
	});
	await probeFailed.heartbeat.start();
	expect(
		HeraldHeartbeatSchema.parse(probeFailed.written[0]?.body),
	).toMatchObject({
		ok: false,
		checks: { eventsDb: { ok: false, error: "eventsDb refused" } },
	});

	const storeUnread = createHarness({
		gate: { active: true, reason: "active" },
		jobs: [],
		storeHealthy: false,
	});
	await storeUnread.heartbeat.start();
	expect(
		HeraldHeartbeatSchema.parse(storeUnread.written[0]?.body),
	).toMatchObject({
		ok: false,
		storeHealthy: false,
	});
});

test("the kafka probe reads the topic and every job group's place: what a task about to join needs", async () => {
	const calls: string[] = [];
	const probes = createHeraldReadinessProbes({
		ctx: {
			admin: {
				fetchTopicMetadata: async ({ topics }: { topics?: string[] }) => {
					calls.push(`metadata:${topics?.join(",")}`);
					return { topics: [] };
				},
				fetchOffsets: async ({ groupId }: { groupId: string }) => {
					calls.push(`offsets:${groupId}`);
					return [];
				},
			} as never,
			eventsDb: { ping: async () => {} },
			miscCache: { getActive: () => ({ ping: async () => "PONG" }) as never },
		},
		config: {
			topic: "local-events",
			groupIds: ["g-usage-events", "g-webhooks"],
		},
	});
	await probes.kafka();
	expect(calls).toEqual([
		"metadata:local-events",
		"offsets:g-usage-events",
		"offsets:g-webhooks",
	]);
});
