import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	parseTrackCommand,
	type SubjectState,
} from "../../../../src/balanceEngine.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
} from "../../engineFixtures.js";

const applyTrack = ({
	state,
	source,
	commandId = "cmd_1",
}: {
	state: SubjectState;
	source?: { atomId: string; seq: number };
	commandId?: string;
}): SubjectState =>
	applyMutation({
		state,
		mutation: computeTrack({
			fullSubject: createSubjectFor({ state }),
			command: parseTrackCommand({
				input: { ...createTrackCommand({ commandId }), source },
			}),
		}),
	});

describe("a track an Atom handed in", () => {
	test.concurrent(
		"moves that Atom's seq on the customer to the command's",
		() => {
			const state = applyTrack({
				state: { ...createState(), atomSeqs: { atom_other: 9 } },
				source: { atomId: "atom_1", seq: 4 },
			});

			expect(state.atomSeqs).toEqual({ atom_other: 9, atom_1: 4 });
		},
	);

	test.concurrent("never moves it back for a lower seq", () => {
		const state = applyTrack({
			state: { ...createState(), atomSeqs: { atom_1: 7 } },
			source: { atomId: "atom_1", seq: 3 },
		});

		expect(state.atomSeqs).toEqual({ atom_1: 7 });
	});

	test.concurrent(
		"a track no Atom handed in leaves the seqs as they were",
		() => {
			const held = { ...createState(), atomSeqs: { atom_1: 7 } };

			expect(applyTrack({ state: held }).atomSeqs).toEqual({ atom_1: 7 });
			expect(applyTrack({ state: createState() }).atomSeqs).toBeUndefined();
		},
	);
});
