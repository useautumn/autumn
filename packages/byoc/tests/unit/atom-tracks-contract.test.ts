import { describe, expect, test } from "bun:test";
import { createTrackCommand } from "../../../balance-engine/tests/unit/engineFixtures.js";
import { AtomTracksAppendRequestSchema } from "../../src/byoc.js";

describe("tracks.append contract", () => {
	test("a request is journaled commands, each with its journal's writer id and per-customer seq", () => {
		const command = createTrackCommand({ commandId: "atom_req_1" });
		const tracks = [
			{ writerId: "w_1", seq: 1, command },
			{ writerId: "w_2", seq: 1, command },
		];

		expect(AtomTracksAppendRequestSchema.parse({ tracks })).toEqual({
			tracks,
		});
		for (const unreadable of [
			{ tracks: [{ writerId: "w_1", seq: 0, command }] },
			{ tracks: [{ seq: 1, command }] },
			{ writer: "w_1", tracks: [{ seq: 1, command }] },
		])
			expect(AtomTracksAppendRequestSchema.safeParse(unreadable).success).toBe(
				false,
			);
	});
});
