import { describe, expect, test } from "bun:test";
import type { TrackItem } from "../../../src/actions/pushHourlyMeters/types/trackItem";
import { pushTrackItems } from "../../../src/utils/pushTrackItems";

const item = (n: number): TrackItem => ({
	customerId: `org_${n}`,
	featureId: "api_call",
	value: 1,
	timestampMs: 0,
	idempotencyKey: `k${n}`,
	properties: {},
});
const silentLogger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	warning: () => {},
	error: () => {},
};

describe("pushTrackItems", () => {
	test("2,300 items → 3 calls of 1000, 1000, 300", async () => {
		const sizes: number[] = [];
		const autumn = {
			batchTrack: async ({ items }: { items: TrackItem[] }) => {
				sizes.push(items.length);
				return { accepted: items.length };
			},
		};
		const result = await pushTrackItems({
			ctx: { autumn, logger: silentLogger },
			items: Array.from({ length: 2300 }, (_, i) => item(i)),
		});
		expect(sizes).toEqual([1000, 1000, 300]);
		expect(result).toEqual({ pushed: 2300, failed: 0, errors: [] });
	});

	test("no items → no calls", async () => {
		let calls = 0;
		const autumn = {
			batchTrack: async () => {
				calls += 1;
				return { accepted: 0 };
			},
		};
		expect(
			await pushTrackItems({
				ctx: { autumn, logger: silentLogger },
				items: [],
			}),
		).toEqual({ pushed: 0, failed: 0, errors: [] });
		expect(calls).toBe(0);
	});

	test("a failed chunk is counted and the rest still go", async () => {
		let call = 0;
		const autumn = {
			batchTrack: async ({ items }: { items: TrackItem[] }) => {
				call += 1;
				if (call === 2) throw new Error("boom");
				return { accepted: items.length };
			},
		};
		const result = await pushTrackItems({
			ctx: { autumn, logger: silentLogger },
			items: Array.from({ length: 2500 }, (_, i) => item(i)),
		});
		expect(result).toEqual({ pushed: 1500, failed: 1000, errors: ["boom"] });
	});
});
