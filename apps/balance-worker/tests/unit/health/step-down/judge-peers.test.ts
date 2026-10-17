import { describe, expect, test } from "bun:test";
import type { SlotHeartbeat } from "../../../../src/blueGreen/types/slotHeartbeat.js";
import { judgePeers } from "../../../../src/health/stepDown/judgePeers.js";

const FAULT_AT = Date.parse("2026-10-16T19:39:01Z");
const NOW = FAULT_AT + 4_000;

function peer({
	endpoint,
	writtenAgoMs = 1_000,
	lastSendAckAgoMs = 1_500,
	ownNetwork = "healthy",
	steppedDown = false,
	work = true,
}: {
	endpoint: string;
	writtenAgoMs?: number;
	lastSendAckAgoMs?: number | null;
	ownNetwork?: "healthy" | "degraded" | "insufficient_data";
	steppedDown?: boolean;
	work?: boolean;
}): SlotHeartbeat {
	return {
		serviceName: "balance-workers",
		fleetId: "fleet",
		deployment: "prod",
		endpoint,
		instanceId: `${endpoint}-${writtenAgoMs}`,
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
			ready: 8,
			admitted: 8,
			total: 8,
			byPartition: [],
		},
		...(work && {
			work: {
				lastSendAckAt:
					lastSendAckAgoMs === null
						? null
						: new Date(NOW - lastSendAckAgoMs).toISOString(),
				ownNetwork,
				steppedDown,
			},
		}),
		startedAt: new Date(NOW - 3_600_000).toISOString(),
		writtenAt: new Date(NOW - writtenAgoMs).toISOString(),
	};
}

function judge(heartbeats: SlotHeartbeat[], unreadable = 0) {
	return judgePeers({
		heartbeats,
		unreadable,
		selfEndpoint: "http://self",
		faultAt: FAULT_AT,
		now: NOW,
		membershipMs: 300_000,
		skewMs: 1_000,
		minPeers: 2,
	});
}

describe("judge peers", () => {
	test("peers that acknowledged sends since the fault, and say so since, vouch that the fault is ours", () => {
		expect(
			judge([
				peer({ endpoint: "http://self", ownNetwork: "degraded" }),
				peer({ endpoint: "http://a" }),
				peer({ endpoint: "http://b" }),
				peer({ endpoint: "http://c", writtenAgoMs: 6_000 }),
			]),
		).toEqual({ ok: true, live: 3, healthy: 2 });
	});

	test("a heartbeat written before the fault, or a send acknowledged before it, says nothing about since", () => {
		expect(
			judge([
				peer({ endpoint: "http://a", writtenAgoMs: 5_000 }),
				peer({ endpoint: "http://b", lastSendAckAgoMs: 4_500 }),
				peer({ endpoint: "http://c", lastSendAckAgoMs: null }),
				peer({ endpoint: "http://d" }),
			]),
		).toEqual({ ok: false, live: 4, healthy: 1 });
	});

	test("peers that see the same trouble, as in a fleet-wide stall, keep everyone in", () => {
		expect(
			judge([
				peer({ endpoint: "http://a", ownNetwork: "degraded" }),
				peer({ endpoint: "http://b", ownNetwork: "degraded" }),
				peer({ endpoint: "http://c" }),
				peer({ endpoint: "http://d" }),
				peer({ endpoint: "http://e", writtenAgoMs: 30_000 }),
			]),
		).toEqual({ ok: false, live: 5, healthy: 2 });
	});

	test("silent peers stay in the count for five minutes; stepped-down peers leave it; old builds never vouch", () => {
		expect(
			judge([
				peer({ endpoint: "http://a" }),
				peer({ endpoint: "http://b" }),
				peer({ endpoint: "http://quiet", writtenAgoMs: 120_000 }),
				peer({ endpoint: "http://gone", writtenAgoMs: 301_000 }),
				peer({ endpoint: "http://out", steppedDown: true }),
				peer({ endpoint: "http://old", work: false }),
			]),
		).toEqual({ ok: true, live: 4, healthy: 2 });
		expect(judge([peer({ endpoint: "http://a" })])).toEqual({
			ok: false,
			live: 1,
			healthy: 1,
		});
	});

	test("heartbeats that cannot be read count against the quorum instead of leaving it", () => {
		expect(
			judge(
				[peer({ endpoint: "http://a" }), peer({ endpoint: "http://b" })],
				3,
			),
		).toEqual({ ok: false, live: 5, healthy: 2 });
	});

	test("one worker counts once, by its latest heartbeat", () => {
		expect(
			judge([
				peer({ endpoint: "http://a" }),
				peer({ endpoint: "http://a", writtenAgoMs: 20_000 }),
				peer({ endpoint: "http://a", writtenAgoMs: 40_000 }),
				peer({ endpoint: "http://b", writtenAgoMs: 20_000 }),
				peer({ endpoint: "http://b" }),
			]),
		).toEqual({ ok: true, live: 2, healthy: 2 });
	});

	test("timestamps within the clock skew of the fault, or ahead of now, do not vouch", () => {
		expect(
			judge([
				peer({
					endpoint: "http://a",
					writtenAgoMs: 3_500,
					lastSendAckAgoMs: 3_600,
				}),
				peer({
					endpoint: "http://b",
					writtenAgoMs: -2_000,
					lastSendAckAgoMs: -2_500,
				}),
				peer({ endpoint: "http://c" }),
				peer({ endpoint: "http://d" }),
			]),
		).toEqual({ ok: true, live: 4, healthy: 2 });
		expect(
			judge([
				peer({
					endpoint: "http://a",
					writtenAgoMs: 3_500,
					lastSendAckAgoMs: 3_600,
				}),
				peer({
					endpoint: "http://b",
					writtenAgoMs: -2_000,
					lastSendAckAgoMs: -2_500,
				}),
				peer({ endpoint: "http://c" }),
			]),
		).toEqual({ ok: false, live: 3, healthy: 1 });
	});
});
