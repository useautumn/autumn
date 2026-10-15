import { describe, expect, test } from "bun:test";
import { createTrackCommand } from "../../../balance-engine/tests/unit/engineFixtures.js";
import { AtomTracksAppendRequestSchema } from "../../src/byoc.js";

describe("tracks.append contract", () => {
	test("a request is one journal's writer id and its commands with their per-customer seq", () => {
		const command = createTrackCommand({ commandId: "atom_req_1" });

		expect(
			AtomTracksAppendRequestSchema.parse({
				writer: "w_1",
				tracks: [{ seq: 1, command }],
			}),
		).toEqual({ writer: "w_1", tracks: [{ seq: 1, command }] });
		for (const unreadable of [
			{ writer: "w_1", tracks: [{ seq: 0, command }] },
			{ tracks: [{ seq: 1, command }] },
		])
			expect(AtomTracksAppendRequestSchema.safeParse(unreadable).success).toBe(
				false,
			);
	});
});
