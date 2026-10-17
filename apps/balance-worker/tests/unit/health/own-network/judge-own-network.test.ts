import { describe, expect, test } from "bun:test";
import {
	judgeOwnNetwork,
	type OwnNetworkThresholds,
} from "../../../../src/health/ownNetwork/judgeOwnNetwork.js";
import type { OwnNetworkSample } from "../../../../src/health/ownNetwork/types/ownNetworkSample.js";

const THRESHOLDS: OwnNetworkThresholds = {
	windowMs: 3_000,
	minSegments: 150,
	retransmitRatio: 0.05,
	stallMs: 1_000,
	minStalledPartitions: 2,
};

/** One sample a second ending at `now`, each with the same loss and the same per-partition send ages. */
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
	sends?: { partition: number; longestInFlightMs: number }[];
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
	return partitions.map((partition) => ({ partition, longestInFlightMs }));
}

describe("judge own network", () => {
	test("loss over the ratio with sends stuck on most busy partitions is degraded", () => {
		const verdict = judgeOwnNetwork({
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

	test("too few segments, as in a blackhole or an idle task, is not enough data", () => {
		const verdict = judgeOwnNetwork({
			samples: samplesOf({
				outSegs: 40,
				retransSegs: 40,
				sends: stalled([80, 81, 82]),
			}),
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(verdict).toMatchObject({
			state: "insufficient_data",
			segments: 120,
		});
	});

	test("a window the samples do not yet cover, or missing counters, is not enough data", () => {
		const young = judgeOwnNetwork({
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
			samples,
			now: 10_000,
			thresholds: THRESHOLDS,
		});
		expect(blind.state).toBe("insufficient_data");
	});
});
