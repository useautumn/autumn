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
		ctx: {
			catalogCache: { changeCount: () => changeCount },
			config: { catalogRecheckMs: 300_000 },
		},
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

describe("inheritCatalog", () => {
	/** A join cache whose clock the test moves. */
	const createClockedFixture = ({ recheckMs }: { recheckMs: number }) => {
		let changeCount = 0;
		let clock = 1_000;
		const joinCache = createSubjectJoinCache({
			ctx: {
				catalogCache: { changeCount: () => changeCount },
				config: { catalogRecheckMs: recheckMs },
				now: () => clock,
			},
		});
		return {
			joinCache,
			moveCatalog: () => {
				changeCount += 1;
			},
			advanceClock: (ms: number) => {
				clock += ms;
			},
		};
	};
	const increment = {
		table: "customerEntitlements",
		op: "increment",
		id: "messages_monthly",
		add: { balance: -1 },
	} as const;

	test("a state advanced by increments keeps its predecessor's joined catalog", () => {
		const { joinCache } = createClockedFixture({ recheckMs: 60_000 });
		const from = createState();
		const to = { ...from, revision: from.revision + 1 };
		const catalog = catalogRowsToCatalog({ rows: [] });
		joinCache.readCatalog({ state: from, join: () => catalog });

		joinCache.inheritCatalog({ from, to, changes: [increment] });

		expect(joinCache.peekCatalog({ state: to })).toBe(catalog);
	});

	test("a mutation that inserts a catalog-referencing row hands nothing on", () => {
		const { joinCache } = createClockedFixture({ recheckMs: 60_000 });
		const from = createState();
		const to = { ...from, revision: from.revision + 1 };
		joinCache.readCatalog({
			state: from,
			join: () => catalogRowsToCatalog({ rows: [] }),
		});

		joinCache.inheritCatalog({
			from,
			to,
			changes: [
				increment,
				{
					table: "customerProducts",
					op: "insert",
					row: createState().customerProducts[0]!,
				},
			],
		});

		expect(joinCache.peekCatalog({ state: to })).toBeNull();
	});

	test("an inherited catalog is re-read once its recheck is due, and after the catalog moves", () => {
		const { joinCache, moveCatalog, advanceClock } = createClockedFixture({
			recheckMs: 60_000,
		});
		const first = createState();
		const second = { ...first, revision: 1 };
		const third = { ...first, revision: 2 };
		const catalog = catalogRowsToCatalog({ rows: [] });
		joinCache.readCatalog({ state: first, join: () => catalog });

		advanceClock(59_000);
		joinCache.inheritCatalog({ from: first, to: second, changes: [increment] });
		expect(joinCache.peekCatalog({ state: second })).toBe(catalog);

		advanceClock(2_000);
		expect(joinCache.peekCatalog({ state: second })).toBeNull();
		joinCache.inheritCatalog({ from: second, to: third, changes: [increment] });
		expect(joinCache.peekCatalog({ state: third })).toBeNull();

		const rejoined = catalogRowsToCatalog({ rows: [] });
		joinCache.readCatalog({ state: third, join: () => rejoined });
		expect(joinCache.peekCatalog({ state: third })).toBe(rejoined);
		moveCatalog();
		expect(joinCache.peekCatalog({ state: third })).toBeNull();
	});
});
