import { describe, expect, test } from "bun:test";
import {
	createCheckCountsBuffer,
	openCheckCounts,
	readCheckCounts,
} from "../../../src/threads/stats/checkCounts.js";

const addTimes = ({
	counts,
	times,
	...check
}: {
	counts: ReturnType<typeof openCheckCounts>;
	times: number;
	orgId: string;
	featureId: string;
	allowed: boolean;
}) => {
	for (let i = 0; i < times; i++) counts.add(check);
};

describe("check counts", () => {
	test("every thread's allowed and denied checks are summed by org and feature, the busiest first", () => {
		const buffer = createCheckCountsBuffer({ threads: 2 });
		const thread0 = openCheckCounts({ buffer, index: 0 });
		const thread1 = openCheckCounts({ buffer, index: 1 });

		addTimes({
			counts: thread0,
			times: 2,
			orgId: "org_1",
			featureId: "messages",
			allowed: true,
		});
		addTimes({
			counts: thread1,
			times: 3,
			orgId: "org_1",
			featureId: "messages",
			allowed: false,
		});
		addTimes({
			counts: thread1,
			times: 1,
			orgId: "org_2",
			featureId: "seats",
			allowed: true,
		});

		expect(readCheckCounts({ buffer })).toEqual({
			top: [
				{ orgId: "org_1", featureId: "messages", allowed: 2, denied: 3 },
				{ orgId: "org_2", featureId: "seats", allowed: 1, denied: 0 },
			],
			other: { allowed: 0, denied: 0 },
		});
	});

	test("a thread counts at most 128 pairs and /health lists 50: the rest are summed into other", () => {
		const buffer = createCheckCountsBuffer({ threads: 1 });
		const counts = openCheckCounts({ buffer, index: 0 });

		for (let feature = 0; feature < 200; feature++)
			addTimes({
				counts,
				times: feature < 10 ? 5 : 1,
				orgId: "org_1",
				featureId: `feature_${feature}`,
				allowed: feature % 2 === 0,
			});

		const { top, other } = readCheckCounts({ buffer });
		expect(top).toHaveLength(50);
		expect(
			top.slice(0, 10).map((count) => count.allowed + count.denied),
		).toEqual(Array(10).fill(5));
		const listed = top.reduce(
			(sum, count) => sum + count.allowed + count.denied,
			0,
		);
		expect(listed + other.allowed + other.denied).toBe(10 * 5 + 190);
	});

	test("ids that do not fit a key's bytes are counted as other, never cut short", () => {
		const buffer = createCheckCountsBuffer({ threads: 1 });
		const counts = openCheckCounts({ buffer, index: 0 });

		counts.add({ orgId: "org_1", featureId: "f".repeat(300), allowed: false });
		counts.add({ orgId: "ørg_é", featureId: "messages", allowed: true });

		expect(readCheckCounts({ buffer })).toEqual({
			top: [{ orgId: "ørg_é", featureId: "messages", allowed: 1, denied: 0 }],
			other: { allowed: 0, denied: 1 },
		});
	});
});
