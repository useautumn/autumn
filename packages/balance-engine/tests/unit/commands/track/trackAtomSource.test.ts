import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	parseTrackCommand,
	type SubjectState,
	type SubjectStateMutation,
} from "../../../../src/balanceEngine.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
} from "../../engineFixtures.js";

type AtomSeqs = Record<string, Record<string, number>>;

const stateHolding = (atomSeqs?: AtomSeqs): SubjectState => {
	const state = createState();
	return { ...state, customer: { ...state.customer, atom_seqs: atomSeqs } };
};

const trackOn = ({
	state,
	source,
}: {
	state: SubjectState;
	source?: { atomId: string; writerId: string; seq: number };
}): SubjectStateMutation =>
	computeTrack({
		fullSubject: createSubjectFor({ state }),
		command: parseTrackCommand({ input: { ...createTrackCommand(), source } }),
	});

const seqsAfter = (params: Parameters<typeof trackOn>[0]) =>
	applyMutation({ state: params.state, mutation: trackOn(params) }).customer
		.atom_seqs;

describe("a track an Atom handed in", () => {
	test.concurrent(
		"raises that journal's seq on the customer row, leaving every other journal's",
		() => {
			const state = stateHolding({ atom_1: { w_old: 40 }, atom_2: { w_x: 9 } });

			expect(
				seqsAfter({
					state,
					source: { atomId: "atom_1", writerId: "w_new", seq: 3 },
				}),
			).toEqual({ atom_1: { w_old: 40, w_new: 3 }, atom_2: { w_x: 9 } });
		},
	);

	test.concurrent(
		"a seq at or below the journal's held one changes nothing on the customer row",
		() => {
			const state = stateHolding({ atom_1: { w_1: 7 } });

			for (const seq of [3, 7]) {
				const mutation = trackOn({
					state,
					source: { atomId: "atom_1", writerId: "w_1", seq },
				});
				expect(
					mutation.changes.some((change) => change.table === "customer"),
				).toBe(false);
			}
		},
	);

	test.concurrent(
		"a track no Atom handed in never touches the customer row",
		() => {
			const mutation = trackOn({ state: stateHolding({ atom_1: { w_1: 7 } }) });

			expect(
				mutation.changes.some((change) => change.table === "customer"),
			).toBe(false);
		},
	);

	test.concurrent(
		"a seq at or below the journal's held one is a replay: it deducts nothing and changes no row",
		() => {
			const state = stateHolding({ atom_1: { w_1: 7 } });

			for (const seq of [3, 7]) {
				const mutation = trackOn({
					state,
					source: { atomId: "atom_1", writerId: "w_1", seq },
				});
				expect(mutation.changes).toEqual([]);
				expect(mutation.result).toMatchObject({
					status: "applied",
					deltas: [],
				});
			}
		},
	);

	test.concurrent(
		"a seq past the held one deducts as any track does, across a gap too",
		() => {
			for (const seq of [8, 12]) {
				const mutation = trackOn({
					state: stateHolding({ atom_1: { w_1: 7 } }),
					source: { atomId: "atom_1", writerId: "w_1", seq },
				});

				expect(mutation.result).toMatchObject({ status: "applied" });
				expect(
					mutation.changes.some(
						(change) => change.table === "customerEntitlements",
					),
				).toBe(true);
			}
		},
	);
});
