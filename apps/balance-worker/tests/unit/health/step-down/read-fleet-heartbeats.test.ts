import { describe, expect, test } from "bun:test";
import { slotHeartbeatKeyOf } from "../../../../src/blueGreen/types/slotHeartbeat.js";
import { readFleetHeartbeats } from "../../../../src/health/stepDown/readFleetHeartbeats.js";
import { createMemoryAdminObjects } from "./memoryAdminObjects.js";
import { peerHeartbeat } from "./peerHeartbeats.js";

function keyOf(instanceId: string, fleetId = "fleet"): string {
	return slotHeartbeatKeyOf({ fleetId, instanceId });
}

function write({
	memory,
	instanceId,
	endpoint,
	fleetId = "fleet",
}: {
	memory: ReturnType<typeof createMemoryAdminObjects>;
	instanceId: string;
	endpoint: string;
	fleetId?: string;
}): void {
	memory.put({
		key: keyOf(instanceId, fleetId),
		body: JSON.stringify(peerHeartbeat({ endpoint })),
	});
}

describe("read fleet heartbeats", () => {
	test("a baseline lists the fleet without reading any heartbeat", async () => {
		const memory = createMemoryAdminObjects();
		write({ memory, instanceId: "1-a", endpoint: "http://a" });
		write({
			memory,
			instanceId: "2-c",
			endpoint: "http://c",
			fleetId: "other",
		});
		const baseline = await readFleetHeartbeats({
			ctx: { objects: memory.objects },
			fleetId: "fleet",
			since: null,
		});
		expect([...baseline.listing.keys()]).toEqual([keyOf("1-a")]);
		expect(baseline.changed).toEqual([]);
		expect(memory.reads.count).toBe(0);
	});

	test("only heartbeats written since the baseline are read, new ones included and unreadable ones skipped", async () => {
		const memory = createMemoryAdminObjects();
		write({ memory, instanceId: "1-a", endpoint: "http://a" });
		write({ memory, instanceId: "2-b", endpoint: "http://b" });
		const baseline = await readFleetHeartbeats({
			ctx: { objects: memory.objects },
			fleetId: "fleet",
			since: null,
		});
		write({ memory, instanceId: "1-a", endpoint: "http://a" });
		write({ memory, instanceId: "3-d", endpoint: "http://d" });
		memory.put({ key: keyOf("4-broken"), body: "{not json" });
		write({
			memory,
			instanceId: "5-e",
			endpoint: "http://e",
			fleetId: "other",
		});
		const later = await readFleetHeartbeats({
			ctx: { objects: memory.objects },
			fleetId: "fleet",
			since: baseline.listing,
		});
		expect(later.changed.map(({ endpoint }) => endpoint).sort()).toEqual([
			"http://a",
			"http://d",
		]);
		expect(memory.reads.count).toBe(3);
	});
});
