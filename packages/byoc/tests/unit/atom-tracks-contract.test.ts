import { describe, expect, test } from "bun:test";
import { createTrackCommand } from "../../../balance-engine/tests/unit/engineFixtures.js";
import { AtomTracksAppendRequestSchema } from "../../src/byoc.js";

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
});
