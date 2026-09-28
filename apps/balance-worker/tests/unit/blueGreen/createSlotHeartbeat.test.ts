import { describe, expect, test } from "bun:test";
import type { EdgeConfigS3Client } from "@autumn/edge-config";
import { createSlotHeartbeat } from "../../../src/blueGreen/createSlotHeartbeat.js";
import type { SlotGateDescription } from "../../../src/blueGreen/isActiveSlot.js";
import {
	SlotHeartbeatSchema,
	slotHeartbeatKeyOf,
} from "../../../src/blueGreen/types/slotHeartbeat.js";
import { ownedPartitionHealthOf } from "../../../src/health/ownedPartitionHealth.js";
import type { PartitionRuntimeStatus } from "../../../src/runtime/types/partitionRuntimeState.js";

const ours = "arn:aws:ecs:us-east-2:1:service/autumn/balance-workers-green";
const health = ({
	partition,
	status,
	lag = 0n,
}: {
	partition: number;
	status: PartitionRuntimeStatus;
	lag?: bigint;
}) =>
	ownedPartitionHealthOf({
		topic: "metering",
		partition,
		status,
		localNextOffset: 10n,
		consumedNextOffset: 10n,
		highWatermark: 10n + lag,
		failureReason: null,
	});

const createHarness = ({
	gate,
	partitions,
	probes = { kafka: async () => undefined, postgres: async () => undefined },
	storeHealthy = true,
	admitted = new Set<number>(),
	assignmentSettled = true,
}: {
	gate: SlotGateDescription;
	partitions: ReturnType<typeof health>[];
	probes?: { kafka(): Promise<void>; postgres(): Promise<void> };
	storeHealthy?: boolean;
	admitted?: Set<number>;
	assignmentSettled?: boolean;
}) => {
	const written: { key: string; body: unknown }[] = [];
	const s3Client: EdgeConfigS3Client = {
		send: async (command) => {
			const { Key, Body } = command.input as { Key: string; Body: string };
			written.push({ key: Key, body: JSON.parse(Body) });
			return {};
		},
	};
	let tick: (() => void) | undefined;
	let cancelled = false;
	const heartbeat = createSlotHeartbeat({
		ctx: {
			s3Client,
			location: { bucket: "autumn-test-server", region: "us-east-2" },
			gate: { describe: () => gate },
			readPartitions: () => partitions,
			isAdmitted: ({ partition }) => admitted.has(partition),
			readAssignmentSettled: () => assignmentSettled,
			readStoreHealthy: () => storeHealthy,
			probes,
			schedule: ({ run }) => {
				tick = run;
				return () => {
					cancelled = true;
				};
			},
		},
		config: {
			deployment: "tf-balance-staging",
			slot: "green",
			endpoint: "http://10.0.0.7:8082",
			identity: { serviceArn: ours, imageSha: "abc123" },
		},
	});
	return {
		heartbeat,
		written,
		tick: () => tick?.(),
		cancelled: () => cancelled,
	};
};

describe("blue-green slot heartbeat", () => {
	test("writes one object per task under the fleet's prefix with the partition rollup", async () => {
		const { heartbeat, written } = createHarness({
			gate: { active: false, reason: "idle", expectedServiceArn: "arn:other" },
			partitions: [
				health({ partition: 0, status: "prepared", lag: 3n }),
				health({ partition: 1, status: "prepared" }),
				health({ partition: 2, status: "preparing", lag: 40n }),
			],
		});
		await heartbeat.start();
		expect(written).toHaveLength(1);
		const [{ key, body }] = written;
		const parsed = SlotHeartbeatSchema.parse(body);
		expect(key).toBe(
			slotHeartbeatKeyOf({ slot: "green", instanceId: parsed.instanceId }),
		);
		expect(key).toMatch(
			/^admin\/blue-green-heartbeats\/balance-workers\/green\/.+\.json$/,
		);
		expect(parsed).toMatchObject({
			serviceName: "balance-workers",
			slot: "green",
			deployment: "tf-balance-staging",
			endpoint: "http://10.0.0.7:8082",
			pid: process.pid,
			identity: { serviceArn: ours, imageSha: "abc123" },
			declaredActive: false,
			gate: "idle",
			storeHealthy: true,
			ok: true,
			checks: { kafka: { ok: true }, postgres: { ok: true } },
			partitions: {
				prepared: 2,
				ready: 0,
				admitted: 0,
				total: 3,
				byPartition: [
					{ partition: 0, status: "prepared", lagRecords: 3 },
					{ partition: 1, status: "prepared", lagRecords: 0 },
					{ partition: 2, status: "preparing", lagRecords: 40 },
				],
			},
		});
		expect(Date.parse(parsed.writtenAt)).toBeGreaterThan(0);
		expect(Date.parse(parsed.startedAt)).toBeLessThanOrEqual(
			Date.parse(parsed.writtenAt),
		);
	});

	test("an active fleet keeps writing: admitted counts routable partitions only, and the gate result travels with it", async () => {
		const { heartbeat, written, tick } = createHarness({
			gate: { active: true, reason: "active" },
			partitions: [
				health({ partition: 0, status: "ready" }),
				// Activating after a silent predecessor: the ownership topic may still name the old owner.
				health({ partition: 1, status: "catching_up", lag: 5n }),
				health({ partition: 2, status: "stopped" }),
			],
			admitted: new Set([0]),
		});
		await heartbeat.start();
		tick();
		await Bun.sleep(5);
		expect(written).toHaveLength(2);
		expect(SlotHeartbeatSchema.parse(written[1].body)).toMatchObject({
			declaredActive: true,
			gate: "active",
			ok: true,
			partitions: { prepared: 0, ready: 1, admitted: 1, total: 3 },
		});
	});

	test("a heartbeat before the first assignment is not ok: it would satisfy prepared == total vacuously", async () => {
		const booting = createHarness({
			gate: { active: false, reason: "idle", expectedServiceArn: "arn:blue" },
			partitions: [],
			assignmentSettled: false,
		});
		await booting.heartbeat.start();
		expect(SlotHeartbeatSchema.parse(booting.written[0].body)).toMatchObject({
			ok: false,
			partitions: { prepared: 0, total: 0 },
		});
		// Assigned but dealt nothing (more workers than partitions) is not ok either.
		const empty = createHarness({
			gate: { active: false, reason: "idle", expectedServiceArn: "arn:blue" },
			partitions: [],
			assignmentSettled: true,
		});
		await empty.heartbeat.start();
		expect(SlotHeartbeatSchema.parse(empty.written[0].body).ok).toBe(false);
	});

	test("an unhealthy slot store alone makes the heartbeat not ok", async () => {
		const { heartbeat, written } = createHarness({
			gate: { active: true, reason: "active" },
			partitions: [],
			storeHealthy: false,
		});
		await heartbeat.start();
		const parsed = SlotHeartbeatSchema.parse(written[0].body);
		expect(parsed.checks.kafka.ok).toBe(true);
		expect(parsed.checks.postgres.ok).toBe(true);
		expect(parsed.storeHealthy).toBe(false);
		expect(parsed.ok).toBe(false);
	});

	test("a failing probe marks the heartbeat not ok and the write still lands; stop cancels the schedule", async () => {
		const { heartbeat, written, cancelled } = createHarness({
			gate: { active: true, reason: "blue-green-disabled" },
			partitions: [],
			probes: {
				kafka: async () => undefined,
				postgres: async () => {
					throw new Error("connection refused");
				},
			},
			storeHealthy: false,
		});
		await heartbeat.start();
		const parsed = SlotHeartbeatSchema.parse(written[0].body);
		expect(parsed.ok).toBe(false);
		expect(parsed.storeHealthy).toBe(false);
		expect(parsed.checks.postgres).toMatchObject({
			ok: false,
			error: "connection refused",
		});
		expect(parsed.checks.kafka.ok).toBe(true);
		heartbeat.stop();
		expect(cancelled()).toBe(true);
	});
});
