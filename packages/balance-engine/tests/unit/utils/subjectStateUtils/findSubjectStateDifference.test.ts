import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	findStructuralDifference,
	findSubjectStateDifference,
	type SubjectState,
	subjectStateRowsOf,
} from "../../../../src/balanceEngine.js";
import {
	createCatalogFor,
	createState,
	createSubjectFor,
	createTrackCommand,
} from "../../engineFixtures.js";

/** The state after one track, as the engine applies it. */
const tracked = ({ state }: { state: SubjectState }) =>
	applyMutation({
		state,
		mutation: computeTrack({
			fullSubject: createSubjectFor({ state }),
			command: createTrackCommand({ value: 3, overageBehavior: "overflow" }),
		}),
	});

/** A state as it arrives in a push: through JSON, its keys in another order. */
const asPushed = (state: SubjectState): SubjectState => {
	const reversed = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(reversed);
		if (typeof value !== "object" || value === null) return value;
		return Object.fromEntries(
			Object.entries(value)
				.reverse()
				.map(([key, field]) => [key, reversed(field)]),
		);
	};
	return reversed(JSON.parse(JSON.stringify(state))) as SubjectState;
};

describe("findSubjectStateDifference", () => {
	test("the same rows at the same revision are the same state, whatever their key order or JSON round trip", () => {
		const state = tracked({ state: createState({ balance: 10 }) });

		expect(
			findSubjectStateDifference({ left: state, right: asPushed(state) }),
		).toBeNull();
	});

	test("the customer's atom_seqs is not compared: only the worker's apply of an Atom's track writes it", () => {
		const state = tracked({ state: createState({ balance: 10 }) });
		const acknowledged: SubjectState = {
			...state,
			customer: { ...state.customer, atom_seqs: { atom_1: { w_1: 4 } } },
		};

		expect(
			findSubjectStateDifference({ left: state, right: acknowledged }),
		).toBeNull();
	});

	test("the revision is not compared: it is the worker's count since it loaded the customer, which resends and reloads move", () => {
		const state = tracked({ state: createState({ balance: 10 }) });

		expect(
			findSubjectStateDifference({
				left: state,
				right: { ...state, revision: 0 },
			}),
		).toBeNull();
	});

	test("a different balance, or a row more, is a different state, named by the first path that differs", () => {
		const state = createState({ balance: 10 });
		const [row] = state.customerEntitlements;
		if (!row) throw new Error("fixture holds a row");

		expect(
			findSubjectStateDifference({
				left: state,
				right: {
					...state,
					customerEntitlements: [{ ...row, balance: 9 }],
				},
			}),
		).toEqual({
			path: "customerEntitlements[0].balance",
			left: 10,
			right: 9,
		});
		expect(
			findSubjectStateDifference({
				left: state,
				right: {
					...state,
					customerEntitlements: [row, { ...row, id: "messages_extra" }],
				},
			}),
		).toEqual({ path: "customerEntitlements.length", left: 1, right: 2 });
	});
});

describe("subjectStateRowsOf", () => {
	test("is the rows the difference compares, so a runtime's deep equality over it decides as findSubjectStateDifference does", () => {
		const state = tracked({ state: createState({ balance: 10 }) });
		const [row] = state.customerEntitlements;
		if (!row) throw new Error("fixture holds a row");
		const sameRows = (right: SubjectState) =>
			Bun.deepEquals(subjectStateRowsOf(state), subjectStateRowsOf(right));
		const others: SubjectState[] = [
			asPushed(state),
			{ ...state, revision: 0 },
			{
				...state,
				customer: { ...state.customer, atom_seqs: { atom_1: { w_1: 4 } } },
			},
			{ ...state, customerEntitlements: [{ ...row, balance: 9 }] },
		];

		expect(others.map(sameRows)).toEqual([true, true, true, false]);
		expect(
			others.map(
				(right) => findSubjectStateDifference({ left: state, right }) === null,
			),
		).toEqual([true, true, true, false]);
	});
});

describe("findStructuralDifference on catalogs", () => {
	test("the same rows are the same catalog, whatever their key order", () => {
		const catalog = createCatalogFor({ state: createState() });

		expect(
			findStructuralDifference({
				left: catalog,
				right: JSON.parse(JSON.stringify(catalog)),
			}),
		).toBeNull();
	});

	test("an edited row is a different catalog", () => {
		const catalog = createCatalogFor({ state: createState() });
		const [id, entitlement] = Object.entries(catalog.entitlements)[0] ?? [];
		if (!id || !entitlement) throw new Error("fixture holds an entitlement");

		expect(
			findStructuralDifference({
				left: catalog,
				right: {
					...catalog,
					entitlements: { [id]: { ...entitlement, allowance: 1 } },
				},
			}),
		).toEqual({
			path: `entitlements.${id}.allowance`,
			left: entitlement.allowance,
			right: 1,
		});
	});
});
