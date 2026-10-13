import { describe, expect, test } from "bun:test";
import { createTrackCommand } from "../../../balance-engine/tests/unit/engineFixtures.js";
import {
	AtomTracksAppendRequestSchema,
	type AtomTracksAppendResponse,
	AtomTracksAppendResponseSchema,
} from "../../src/byoc.js";

describe("tracks.append contract", () => {
	test("a request is the journaled commands with their per-customer seq", () => {
		const command = createTrackCommand({ commandId: "atom_req_1" });

		expect(
			AtomTracksAppendRequestSchema.parse({ tracks: [{ seq: 1, command }] }),
		).toEqual({ tracks: [{ seq: 1, command }] });
		expect(
			AtomTracksAppendRequestSchema.safeParse({ tracks: [{ seq: 0, command }] })
				.success,
		).toBe(false);
	});

	test("a reply names each track's outcome in order, and only a refusal carries a code", () => {
		const results: AtomTracksAppendResponse["results"] = [
			{ seq: 1, outcome: "applied" },
			{ seq: 2, outcome: "duplicate" },
			{ seq: 3, outcome: "rejected", code: "feature_not_found" },
		];

		expect(AtomTracksAppendResponseSchema.parse({ results })).toEqual({
			results,
		});
		expect(
			AtomTracksAppendResponseSchema.safeParse({
				results: [{ seq: 3, outcome: "rejected" }],
			}).success,
		).toBe(false);
	});
});
