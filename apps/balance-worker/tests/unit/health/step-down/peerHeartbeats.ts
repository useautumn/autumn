import type { SlotHeartbeat } from "../../../../src/blueGreen/types/slotHeartbeat.js";

export function peerHeartbeat({
	endpoint,
	partitions = [],
	lastSendAckAgeMs = 40,
	ownNetwork = "healthy",
	steppedDown = false,
	work = true,
	writtenAt = "2026-10-16T19:39:05.000Z",
}: {
	endpoint: string;
	partitions?: number[];
	lastSendAckAgeMs?: number | null;
	ownNetwork?: "healthy" | "degraded" | "insufficient_data";
	steppedDown?: boolean;
	work?: boolean;
	writtenAt?: string;
}): SlotHeartbeat {
	return {
		serviceName: "balance-workers",
		fleetId: "fleet",
		deployment: "prod",
		endpoint,
		instanceId: endpoint,
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
		partitions: {
			prepared: 0,
			ready: partitions.length,
			admitted: partitions.length,
			total: partitions.length,
			byPartition: partitions.map((partition) => ({
				partition,
				status: "ready",
				lagRecords: 0,
			})),
		},
		...(work && { work: { lastSendAckAgeMs, ownNetwork, steppedDown } }),
		startedAt: "2026-10-16T18:00:00.000Z",
		writtenAt,
	};
}

export function partitionsFrom({
	first,
	count,
}: {
	first: number;
	count: number;
}): number[] {
	return Array.from({ length: count }, (_, index) => first + index);
}
