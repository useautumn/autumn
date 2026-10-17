import { describe, expect, test } from "bun:test";
import { judgePeers } from "../../../../src/health/stepDown/judgePeers.js";
import { partitionsFrom, peerHeartbeat } from "./peerHeartbeats.js";

const PARTITION_COUNT = 128;

function fleetPeer(
	index: number,
	overrides: Partial<Parameters<typeof peerHeartbeat>[0]> = {},
) {
	return peerHeartbeat({
		endpoint: `http://w${index}`,
		partitions: partitionsFrom({ first: index * 8, count: 8 }),
		...overrides,
	});
}

function fleetPeers(indexes: number[]) {
	return indexes.map((index) => fleetPeer(index));
}

function judge(heartbeats: ReturnType<typeof peerHeartbeat>[]) {
	return judgePeers({
		heartbeats,
		selfEndpoint: "http://self",
		partitionCount: PARTITION_COUNT,
		ackAgeLimitMs: 3_000,
		minPeers: 2,
	});
}

describe("judge peers", () => {
	test("peers that wrote since the decision began, acking sends and holding half the partitions, vouch that the fault is ours", () => {
		expect(judge(fleetPeers([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual({
			ok: true,
			vouching: 8,
			partitions: 64,
			partitionCount: 128,
		});
	});

	test("two healthy peers while thirteen stay silent are no quorum: silence never shrinks the fleet", () => {
		expect(judge(fleetPeers([1, 2]))).toEqual({
			ok: false,
			vouching: 2,
			partitions: 16,
			partitionCount: 128,
		});
	});

	test("a peer that is degraded, stepped down, has not acked a send lately or runs an old build does not vouch", () => {
		expect(
			judge([
				...fleetPeers([1, 2, 3, 4, 5, 6, 7]),
				fleetPeer(8, { ownNetwork: "degraded" }),
				fleetPeer(9, { steppedDown: true }),
				fleetPeer(10, { lastSendAckAgeMs: 3_001 }),
				fleetPeer(11, { lastSendAckAgeMs: null }),
				fleetPeer(12, { work: false }),
			]),
		).toEqual({ ok: false, vouching: 7, partitions: 56, partitionCount: 128 });
	});

	test("a partition two peers report counts once, and one peer holding everything is not enough alone", () => {
		const everything = peerHeartbeat({
			endpoint: "http://big",
			partitions: partitionsFrom({ first: 0, count: 128 }),
		});
		expect(judge([everything])).toEqual({
			ok: false,
			vouching: 1,
			partitions: 128,
			partitionCount: 128,
		});
		expect(judge([everything, fleetPeer(1)])).toEqual({
			ok: true,
			vouching: 2,
			partitions: 128,
			partitionCount: 128,
		});
	});

	test("the worker never vouches for itself, and a worker that wrote twice counts once", () => {
		const self = peerHeartbeat({
			endpoint: "http://self",
			partitions: partitionsFrom({ first: 0, count: 64 }),
		});
		expect(judge([self, fleetPeer(9)]).ok).toBe(false);
		expect(
			judge([fleetPeer(1), ...fleetPeers([1, 2, 3, 4, 5, 6, 7, 8])]).vouching,
		).toBe(8);
	});

	test("no clock from another host plays a part", () => {
		expect(
			judge(
				[1, 2, 3, 4, 5, 6, 7, 8].map((index) =>
					fleetPeer(index, { writtenAt: "1999-01-01T00:00:00.000Z" }),
				),
			).ok,
		).toBe(true);
	});
});
