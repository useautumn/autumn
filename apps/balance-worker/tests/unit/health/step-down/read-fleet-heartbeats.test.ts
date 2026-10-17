import { describe, expect, test } from "bun:test";
import { slotHeartbeatKeyOf } from "../../../../src/blueGreen/types/slotHeartbeat.js";
import { readFleetHeartbeats } from "../../../../src/health/stepDown/readFleetHeartbeats.js";
import { createMemoryAdminObjects } from "./memoryAdminObjects.js";

const heartbeat = {
	serviceName: "balance-workers",
	fleetId: "fleet",
	deployment: "prod",
	endpoint: "http://a",
	instanceId: "1-a",
	pid: 1,
	identity: { serviceArn: null, imageSha: null },
	declaredActive: true,
	gate: "active",
	storeHealthy: true,
	ok: true,
	checks: {
		kafka: { ok: true, latencyMs: 1 },
		postgres: { ok: true, latencyMs: 1 },
	},
	partitions: { prepared: 0, ready: 8, admitted: 8, total: 8, byPartition: [] },
	startedAt: "2026-10-16T18:00:00.000Z",
	writtenAt: "2026-10-16T19:39:03.000Z",
};

describe("read fleet heartbeats", () => {
	test("reads the fleet's recent heartbeats, skipping stale objects, other fleets and unreadable ones", async () => {
		const time = { now: 10_000 };
		const memory = createMemoryAdminObjects({ now: () => time.now });
		memory.put({
			key: slotHeartbeatKeyOf({ fleetId: "fleet", instanceId: "1-a" }),
			body: JSON.stringify(heartbeat),
		});
		memory.put({
			key: slotHeartbeatKeyOf({ fleetId: "fleet", instanceId: "2-broken" }),
			body: "{not json",
		});
		memory.put({
			key: slotHeartbeatKeyOf({ fleetId: "other", instanceId: "3-c" }),
			body: JSON.stringify({ ...heartbeat, fleetId: "other" }),
		});
		time.now = 100_000;
		memory.put({
			key: slotHeartbeatKeyOf({ fleetId: "fleet", instanceId: "4-d" }),
			body: JSON.stringify({ ...heartbeat, endpoint: "http://d" }),
		});
		const read = await readFleetHeartbeats({
			ctx: { objects: memory.objects },
			fleetId: "fleet",
			modifiedAfter: 50_000,
		});
		expect(read.map(({ endpoint }) => endpoint)).toEqual(["http://d"]);
		const all = await readFleetHeartbeats({
			ctx: { objects: memory.objects },
			fleetId: "fleet",
			modifiedAfter: 0,
		});
		expect(all.map(({ endpoint }) => endpoint).sort()).toEqual([
			"http://a",
			"http://d",
		]);
	});
});
