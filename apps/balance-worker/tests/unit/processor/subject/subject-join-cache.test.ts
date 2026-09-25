import { describe, expect, test } from "bun:test";
import {
	catalogRowsToCatalog,
	type SubjectState,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import { createSubjectJoinCache } from "../../../../src/processor/subject/subjectJoinCache/createSubjectJoinCache.js";
import { createState, createSubjectFor } from "../../../fixtures/mutations.js";

/** A catalog cache that only reports its change count, moved by the test. */
const createFixture = () => {
	let changeCount = 0;
	const joinCache = createSubjectJoinCache({
		ctx: { catalogCache: { changeCount: () => changeCount } },
	});
	let joins = 0;
	const joinFor =
		({ state }: { state: SubjectState }) =>
		(): WorkerFullSubject => {
			joins += 1;
			return createSubjectFor({ state });
		};
	return {
		joinCache,
		joinFor,
		joins: () => joins,
		moveCatalog: () => {
			changeCount += 1;
		},
	};
};

describe("subject join cache", () => {
	test("joins a state once and serves every later read of it", () => {
		const { joinCache, joinFor, joins } = createFixture();
		const state = createState();

		const first = joinCache.readFullSubject({
			state,
			entityId: null,
			join: joinFor({ state }),
		});
		const second = joinCache.readFullSubject({
			state,
			entityId: null,
			join: joinFor({ state }),
		});

		expect(second).toBe(first);
		expect(joins()).toBe(1);
	});

	test("a new state object is a new join, even with equal rows", () => {
		const { joinCache, joinFor, joins } = createFixture();
		const state = createState();
		const next = { ...state };

		joinCache.readFullSubject({
			state,
			entityId: null,
			join: joinFor({ state }),
		});
		joinCache.readFullSubject({
			state: next,
			entityId: null,
			join: joinFor({ state: next }),
		});

		expect(joins()).toBe(2);
	});

	test("each entity of a state is joined on its own", () => {
		const { joinCache, joinFor, joins } = createFixture();
		const state = createState();

		joinCache.readFullSubject({
			state,
			entityId: null,
			join: joinFor({ state }),
		});
		joinCache.readFullSubject({
			state,
			entityId: "ent_1",
			join: joinFor({ state }),
		});

		expect(joins()).toBe(2);
	});

	test("a catalog change rejoins the state and its catalog", () => {
		const { joinCache, joinFor, joins, moveCatalog } = createFixture();
		const state = createState();
		let catalogJoins = 0;
		const joinCatalog = () => {
			catalogJoins += 1;
			return catalogRowsToCatalog({ rows: [] });
		};

		joinCache.readFullSubject({
			state,
			entityId: null,
			join: joinFor({ state }),
		});
		joinCache.readCatalog({ state, join: joinCatalog });
		moveCatalog();
		joinCache.readFullSubject({
			state,
			entityId: null,
			join: joinFor({ state }),
		});
		joinCache.readCatalog({ state, join: joinCatalog });

		expect(joins()).toBe(2);
		expect(catalogJoins).toBe(2);
	});
});

describe("peekCatalog", () => {
	test("answers only with a catalog joined for this state at the current change count", () => {
		const fixture = createFixture();
		const state = createState();
		const catalog = catalogRowsToCatalog({ rows: [] });
		expect(fixture.joinCache.peekCatalog({ state })).toBeNull();
		expect(fixture.joinCache.readCatalog({ state, join: () => catalog })).toBe(
			catalog,
		);
		expect(fixture.joinCache.peekCatalog({ state })).toBe(catalog);
		// A replaced state is a different object; the catalog moving invalidates the join.
		expect(fixture.joinCache.peekCatalog({ state: createState() })).toBeNull();
		fixture.moveCatalog();
		expect(fixture.joinCache.peekCatalog({ state })).toBeNull();
	});
});
