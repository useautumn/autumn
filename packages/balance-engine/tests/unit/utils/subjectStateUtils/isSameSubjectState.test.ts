import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	isSameCatalog,
	isSameSubjectState,
	type SubjectState,
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

describe("isSameSubjectState", () => {
	test("the same rows at the same revision are the same state, whatever their key order or JSON round trip", () => {
		const state = tracked({ state: createState({ balance: 10 }) });

		expect(isSameSubjectState({ left: state, right: asPushed(state) })).toBe(
			true,
		);
	});

	test("the customer's atom_seqs is not compared: only the worker's apply of an Atom's track writes it", () => {
		const state = tracked({ state: createState({ balance: 10 }) });
		const acknowledged: SubjectState = {
			...state,
			customer: { ...state.customer, atom_seqs: { atom_1: { w_1: 4 } } },
		};

		expect(isSameSubjectState({ left: state, right: acknowledged })).toBe(true);
	});

	test("a different revision is a different state: Autumn applied something else", () => {
		const state = tracked({ state: createState({ balance: 10 }) });

		expect(
			isSameSubjectState({
				left: state,
				right: { ...state, revision: state.revision + 1 },
			}),
		).toBe(false);
	});

	test("a different balance, or a row more, is a different state", () => {
		const state = createState({ balance: 10 });
		const [row] = state.customerEntitlements;
		if (!row) throw new Error("fixture holds a row");

		expect(
			isSameSubjectState({
				left: state,
				right: {
					...state,
					customerEntitlements: [{ ...row, balance: 9 }],
				},
			}),
		).toBe(false);
		expect(
			isSameSubjectState({
				left: state,
				right: {
					...state,
					customerEntitlements: [row, { ...row, id: "messages_extra" }],
				},
			}),
		).toBe(false);
	});
});

describe("isSameCatalog", () => {
	test("the same rows are the same catalog, whatever their key order", () => {
		const catalog = createCatalogFor({ state: createState() });

		expect(
			isSameCatalog({
				left: catalog,
				right: JSON.parse(JSON.stringify(catalog)),
			}),
		).toBe(true);
	});

	test("an edited row is a different catalog", () => {
		const catalog = createCatalogFor({ state: createState() });
		const [id, entitlement] = Object.entries(catalog.entitlements)[0] ?? [];
		if (!id || !entitlement) throw new Error("fixture holds an entitlement");

		expect(
			isSameCatalog({
				left: catalog,
				right: {
					...catalog,
					entitlements: { [id]: { ...entitlement, allowance: 1 } },
				},
			}),
		).toBe(false);
	});
});
