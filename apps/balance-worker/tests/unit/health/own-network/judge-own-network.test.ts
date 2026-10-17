import { describe, expect, test } from "bun:test";
import {
	judgeOwnNetwork,
	type OwnNetworkThresholds,
} from "../../../../src/health/ownNetwork/judgeOwnNetwork.js";
import type { OwnNetworkSample } from "../../../../src/health/ownNetwork/types/ownNetworkSample.js";

const THRESHOLDS: OwnNetworkThresholds = {
	windowMs: 3_000,
	minRetransmits: 15,
	retransmitRatio: 0.05,
	stallMs: 1_000,
	minStalledPartitions: 2,
};

function samplesOf({
	now = 10_000,
	count = 4,
	outSegs = 100,
	retransSegs = 0,
	sends = [],
}: {
	now?: number;
	count?: number;
	outSegs?: number;
	retransSegs?: number;
	sends?: { partition: number; holding: number; longestInFlightMs: number }[];
}): OwnNetworkSample[] {
	const samples: OwnNetworkSample[] = [];
	for (let index = count - 1; index >= 0; index--)
		samples.push({
			at: now - index * 1_000,
			tcp: { outSegs, retransSegs },
			sends,
		});
	return samples;
}

function stalled(partitions: number[], longestInFlightMs = 1_500) {
	return partitions.map((partition) => ({
		partition,
		holding: 1,
		longestInFlightMs,
	}));
}

describe("judge own network", () => {
	test("loss over the ratio with sends stuck on most busy partitions is degraded", () => {
		const verdict = judgeOwnNetwork({
			heldPartitions: 6,
			samples: samplesOf({
				retransSegs: 30,
				sends: [...stalled([80, 81, 82, 83, 84]), ...stalled([85], 200)],
			}),
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(verdict).toMatchObject({
			state: "degraded",
			segments: 300,
			retransmitRatio: 0.3,
			busyPartitions: 6,
			stalledPartitions: 5,
			windowStartedAt: 8_000,
		});
	});

	test("loss with sends stuck on only some partitions, as with one broker path, stays healthy", () => {
		const verdict = judgeOwnNetwork({
			heldPartitions: 6,
			samples: samplesOf({
				retransSegs: 30,
				sends: [...stalled([80, 81]), ...stalled([82, 83, 84, 85], 300)],
			}),
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(verdict).toMatchObject({
			state: "healthy",
			busyPartitions: 6,
			stalledPartitions: 2,
		});
	});

	test("sends stuck everywhere without local loss, as in a fleet-wide Kafka stall, stays healthy", () => {
		const verdict = judgeOwnNetwork({
			heldPartitions: 4,
			samples: samplesOf({
				retransSegs: 1,
				sends: stalled([80, 81, 82, 83]),
			}),
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(verdict.state).toBe("healthy");
	});

	test("one stuck partition is not enough, even when it is the only busy one", () => {
		const verdict = judgeOwnNetwork({
			heldPartitions: 1,
			samples: samplesOf({ retransSegs: 30, sends: stalled([25]) }),
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(verdict).toMatchObject({
			state: "healthy",
			busyPartitions: 1,
			stalledPartitions: 1,
		});
	});

	test("a send stuck in any sample of the window counts for its partition", () => {
		const samples = samplesOf({ retransSegs: 30 });
		samples[1] = { ...samples[1], sends: stalled([80, 81]) };
		samples[3] = { ...samples[3], sends: stalled([82], 100) };
		const verdict = judgeOwnNetwork({
			heldPartitions: 3,
			samples,
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(verdict).toMatchObject({
			state: "degraded",
			busyPartitions: 3,
			stalledPartitions: 2,
		});
	});

	test("a lossy worker whose traffic collapsed is still judged, by the segments it had to retransmit", () => {
		const verdict = judgeOwnNetwork({
			heldPartitions: 3,
			samples: samplesOf({
				outSegs: 40,
				retransSegs: 12,
				sends: stalled([80, 81, 82]),
			}),
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(verdict).toMatchObject({
			state: "degraded",
			segments: 120,
			losesPackets: true,
		});
	});

	test("a few retransmits on a quiet worker are not loss, whatever their share", () => {
		const verdict = judgeOwnNetwork({
			heldPartitions: 3,
			samples: samplesOf({
				outSegs: 44,
				retransSegs: 4,
				sends: stalled([80, 81, 82]),
			}),
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(verdict).toMatchObject({
			state: "healthy",
			retransmitRatio: 12 / 132,
			losesPackets: false,
		});
	});

	test("a window with no segments at all is not enough data", () => {
		const verdict = judgeOwnNetwork({
			heldPartitions: 3,
			samples: samplesOf({ outSegs: 0, sends: stalled([80, 81, 82]) }),
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(verdict.state).toBe("insufficient_data");
	});

	test("the verdict says whether packets are being lost even when the stalls do not corroborate it", () => {
		const verdict = judgeOwnNetwork({
			heldPartitions: 1,
			samples: samplesOf({ retransSegs: 30, sends: stalled([80], 1_500) }),
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(verdict).toMatchObject({ state: "healthy", losesPackets: true });
	});

	test("calibrated defaults: 20% loss with sends of 350 ms on most partitions is degraded within one window", () => {
		const verdict = judgeOwnNetwork({
			heldPartitions: 4,
			samples: samplesOf({
				outSegs: 100,
				retransSegs: 20,
				sends: [...stalled([80, 81, 82], 350), ...stalled([83], 40)],
			}),
			now: 10_000,
		});
		expect(verdict).toMatchObject({
			state: "degraded",
			stalledPartitions: 3,
			losesPackets: true,
		});
	});

	test("calibrated defaults: a healthy worker's busiest window and a fleet-wide Kafka stall's tail loss probes stay healthy", () => {
		const busy = judgeOwnNetwork({
			heldPartitions: 4,
			samples: samplesOf({
				outSegs: 790,
				retransSegs: 6,
				sends: stalled([80, 81, 82, 83], 120),
			}),
			now: 10_000,
		});
		expect(busy).toMatchObject({ state: "healthy", losesPackets: false });
		const kafkaStall = samplesOf({
			outSegs: 44,
			sends: stalled([80, 81, 82, 83], 2_000),
		});
		kafkaStall[3] = {
			...kafkaStall[3],
			tcp: { outSegs: 83, retransSegs: 10 },
		};
		expect(judgeOwnNetwork({
			heldPartitions: 4, samples: kafkaStall, now: 10_000 })).toMatchObject(
			{ state: "healthy", losesPackets: false },
		);
	});

	test("a window the samples do not yet cover, or missing counters, is not enough data", () => {
		const young = judgeOwnNetwork({
			heldPartitions: 3,
			samples: samplesOf({
				count: 3,
				retransSegs: 30,
				sends: stalled([80, 81, 82]),
			}),
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(young.state).toBe("insufficient_data");
		const samples = samplesOf({
			retransSegs: 30,
			sends: stalled([80, 81, 82]),
		});
		samples[2] = { ...samples[2], tcp: null };
		const blind = judgeOwnNetwork({
			heldPartitions: 3,
			samples,
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(blind.state).toBe("insufficient_data");
	});

	test("calibrated defaults: a quiet worker whose two slow sends are among eight held partitions stays healthy, whatever its retransmits", () => {
		const verdict = judgeOwnNetwork({
			heldPartitions: 8,
			samples: samplesOf({
				outSegs: 50,
				retransSegs: 5,
				sends: stalled([80, 81], 350),
			}),
			now: 10_000,
		});
		expect(verdict).toMatchObject({
			state: "healthy",
			losesPackets: true,
			busyPartitions: 2,
			stalledPartitions: 2,
		});
	});

	test("calibrated defaults: one broker's partitions stalling under heavy retransmits stay healthy", () => {
		const verdict = judgeOwnNetwork({
			heldPartitions: 8,
			samples: samplesOf({
				outSegs: 800,
				retransSegs: 50,
				sends: [
					...stalled([80, 81, 82], 400),
					...stalled([83, 84, 85, 86, 87], 20),
				],
			}),
			now: 10_000,
		});
		expect(verdict).toMatchObject({
			state: "healthy",
			losesPackets: true,
			stalledPartitions: 3,
		});
	});

	test("the verdict names each stalled partition with the holding its sends started under", () => {
		const verdict = judgeOwnNetwork({
			heldPartitions: 3,
			samples: samplesOf({
				retransSegs: 30,
				sends: [
					{ partition: 80, holding: 7, longestInFlightMs: 1_500 },
					{ partition: 81, holding: 7, longestInFlightMs: 1_500 },
					{ partition: 82, holding: 9, longestInFlightMs: 100 },
				],
			}),
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(verdict).toMatchObject({
			state: "degraded",
			heldPartitions: 3,
			stalledHoldings: [
				{ partition: 80, holding: 7 },
				{ partition: 81, holding: 7 },
			],
		});
	});
});
