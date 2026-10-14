import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { CatalogRow } from "@autumn/balance-engine";
import {
	applyMutation,
	type Catalog,
	computeTrack,
	type SubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import { CheckExpand } from "@autumn/shared";
import {
	createCatalogRowsFor,
	createState,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { getAtomLogger } from "../../../src/lib/logging/getAtomLogger.js";
import {
	readCurrentSubject,
	readViewFoldThreadStats,
} from "../../../src/processor/actions/readCurrentSubject/readCurrentSubject.js";
import * as replay from "../../../src/processor/actions/readCurrentSubject/replayOwed.js";
import { createSlotProcessor } from "../../../src/processor/createSlotProcessor.js";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import { openCatalogStore } from "../../../src/state/openCatalogStore.js";
import { createOpenLocks } from "../../../src/state/openLocks/createOpenLocks.js";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import {
	checkRequestFor,
	checkResponseOf,
	forwardReasonOf,
	freshHeld,
	noFolderPulls,
	oldestApiVersion,
	storedEntitySubjectWith,
	storedSubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";
import { openSlotProcessor, owedCommand } from "../utils/journalFixtures.js";

const stores: { close(): void }[] = [];
const createProcessor = () => {
	const sqliteStore = openSqliteStore({
		databasePath: ":memory:",
		held: freshHeld(),
	});
	const catalogStore = openCatalogStore({ databasePath: ":memory:" });
	const journal = openJournal({ databasePath: ":memory:" });
	stores.push(sqliteStore, catalogStore, journal);
	const processor = createSlotProcessor({
		ctx: {
			sqliteStore,
			catalogStore,
			logger: getAtomLogger(),
			subjectPulls: noFolderPulls,
			journal,
			openLocks: createOpenLocks(),
		},
	});
	return {
		setSubject: processor.setSubject,
		setCatalog: catalogStore.set,
		check: ({ request }: { request: CheckRequest }) =>
			checkResponseOf({ processor, request }),
		answer: processor.check,
	};
};
afterEach(() => {
	for (const store of stores.splice(0)) store.close();
});

const checkBalance = ({ requiredBalance }: { requiredBalance: number }) =>
	checkRequestFor({ params: { required_balance: requiredBalance } });

describe("slot processor check", () => {
	test("a requirement within the stored balance is allowed, answered as the API answers", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
		);

		const reply = await processor.check({
			request: checkBalance({ requiredBalance: 10 }),
		});

		expect(reply).toMatchObject({
			allowed: true,
			customer_id: "cus_1",
			required_balance: 10,
			balance: { feature_id: "messages", remaining: 10 },
		});
	});

	test("a requirement past the stored balance is refused", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
		);

		const reply = await processor.check({
			request: checkBalance({ requiredBalance: 11 }),
		});

		expect(reply.allowed).toBe(false);
	});

	test("beside its JSON, a check hands back the verdict its body carries, for the request line", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
		);

		for (const requiredBalance of [10, 11]) {
			const { json, allowed } = await processor.answer({
				request: checkBalance({ requiredBalance }),
			});
			expect(allowed).toBe(requiredBalance <= 10);
			expect(JSON.parse(json).allowed).toBe(allowed);
		}
	});

	test("the answer follows the subject Autumn sent last", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
		);
		await processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 3 }) }),
		);

		const reply = await processor.check({
			request: checkBalance({ requiredBalance: 5 }),
		});

		expect(reply).toMatchObject({
			allowed: false,
			balance: { remaining: 3 },
		});
	});

	test("an older API version gets that version's response", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
		);

		const reply = await processor.check({
			request: checkRequestFor({ apiVersion: oldestApiVersion }),
		});

		// The oldest version's shape, not the latest the reply is typed as.
		expect<unknown>(reply).toEqual({
			allowed: true,
			balances: [{ feature_id: "messages", required: 1, balance: 10 }],
		});
	});

	test("the feature is expanded in the balance only when asked for", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
		);

		const plain = await processor.check({ request: checkRequestFor() });
		const expanded = await processor.check({
			request: checkRequestFor({
				query: { expand: [CheckExpand.BalanceFeature] },
			}),
		});

		expect(plain.balance?.feature).toBeUndefined();
		expect(expanded.balance?.feature?.id).toBe("messages");
	});

	test("a customer Atom does not hold goes to the API", async () => {
		const processor = createProcessor();

		const request = checkRequestFor({ params: { customer_id: "cus_unknown" } });

		expect(await forwardReasonOf(() => processor.check({ request }))).toBe(
			"customer_not_stored",
		);
	});

	test("a feature the org does not have, as far as Atom knows, goes to the API", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
		);

		const request = checkRequestFor({ params: { feature_id: "seats" } });

		expect(await forwardReasonOf(() => processor.check({ request }))).toBe(
			"feature_not_stored",
		);
	});
});

describe("slot processor check on an entity", () => {
	const checkEntity = ({ requiredBalance }: { requiredBalance: number }) =>
		checkRequestFor({
			params: { entity_id: "ent_42", required_balance: requiredBalance },
		});

	test("an entity is answered from the customer's balance and its own together", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({
				subject: storedEntitySubjectWith({
					customerBalance: 10,
					entityBalance: 5,
				}),
			}),
		);

		const within = await processor.check({
			request: checkEntity({ requiredBalance: 15 }),
		});
		const past = await processor.check({
			request: checkEntity({ requiredBalance: 16 }),
		});

		expect(within).toMatchObject({ allowed: true, entity_id: "ent_42" });
		expect(past.allowed).toBe(false);
	});

	test("the entity's push also stores the customer, without the entity's own rows", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({
				subject: storedEntitySubjectWith({
					customerBalance: 10,
					entityBalance: 5,
				}),
			}),
		);

		const customerAt10 = await processor.check({
			request: checkRequestFor({ params: { required_balance: 10 } }),
		});
		const customerAt11 = await processor.check({
			request: checkRequestFor({ params: { required_balance: 11 } }),
		});

		expect(customerAt10.allowed).toBe(true);
		expect(customerAt11.allowed).toBe(false);
	});

	test("a later push of the customer alone changes what its entity is answered", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({
				subject: storedEntitySubjectWith({
					customerBalance: 10,
					entityBalance: 5,
					readAt: 1000,
				}),
			}),
		);

		await processor.setSubject(
			subjectPushOf({
				subject: storedSubjectWith({ balance: 2, readAt: 2000 }),
			}),
		);

		// 2 left on the customer and 5 on the entity.
		expect(
			(await processor.check({ request: checkEntity({ requiredBalance: 7 }) }))
				.allowed,
		).toBe(true);
		expect(
			(await processor.check({ request: checkEntity({ requiredBalance: 8 }) }))
				.allowed,
		).toBe(false);
	});

	test("an entity Atom does not hold goes to the API", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
		);

		expect(
			await forwardReasonOf(() =>
				processor.check({ request: checkEntity({ requiredBalance: 1 }) }),
			),
		).toBe("entity_not_stored");
	});
});

describe("each customer's own catalog slice", () => {
	/** The fixture customer under another id, its plan's entitlements granting `allowance`. */
	const customerWith = ({
		customerId = "cus_1",
		allowance,
		isCustom = false,
		readAt = 1000,
	}: {
		customerId?: string;
		allowance: number;
		isCustom?: boolean;
		readAt?: number;
	}) => {
		const subject = structuredClone(storedSubjectWith({ balance: 10, readAt }));
		subject.state.identity = { ...subject.state.identity, customerId };
		for (const entitlement of Object.values(subject.catalog.entitlements))
			Object.assign(entitlement, { allowance, is_custom: isCustom });
		return subject;
	};
	const grantedFor = async ({
		processor,
		customerId = "cus_1",
	}: {
		processor: ReturnType<typeof createProcessor>;
		customerId?: string;
	}) =>
		(
			await processor.check({
				request: checkRequestFor({ params: { customer_id: customerId } }),
			})
		).balance?.granted;
	const planRows = createCatalogRowsFor({ state: createState() });
	const rowsWithout = ({ table }: { table: CatalogRow["table"] }) =>
		planRows.filter((row) => row.table !== table);

	test("a catalog change reaches the customer with its next push", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({ subject: customerWith({ allowance: 1000 }) }),
		);
		expect(await grantedFor({ processor })).toBe(1000);

		await processor.setSubject(
			subjectPushOf({
				subject: customerWith({ allowance: 500, readAt: 2000 }),
			}),
		);

		expect(await grantedFor({ processor })).toBe(500);
	});

	test("two customers on one plan each answer from their own slice", async () => {
		const processor = createProcessor();
		for (const customerId of ["cus_a", "cus_b"])
			await processor.setSubject(
				subjectPushOf({
					subject: customerWith({ customerId, allowance: 1000 }),
				}),
			);

		await processor.setSubject(
			subjectPushOf({
				subject: customerWith({
					customerId: "cus_a",
					allowance: 500,
					readAt: 2000,
				}),
			}),
		);

		expect(await grantedFor({ processor, customerId: "cus_a" })).toBe(500);
		expect(await grantedFor({ processor, customerId: "cus_b" })).toBe(1000);
	});

	test("a custom-plan customer keeps its own rows when the shared catalog lacks them", async () => {
		const processor = createProcessor();
		await processor.setSubject(
			subjectPushOf({
				subject: customerWith({ allowance: 300, isCustom: true }),
			}),
		);

		processor.setCatalog({
			rows: rowsWithout({ table: "entitlements" }),
			readAt: 2000,
		});

		expect(await grantedFor({ processor })).toBe(300);
	});

	test("after a plan update retires its rows (is_custom), the customer still answers from its own row", async () => {
		const processor = createProcessor();
		processor.setCatalog({ rows: planRows, readAt: 900 });
		await processor.setSubject(
			subjectPushOf({ subject: customerWith({ allowance: 1000 }) }),
		);

		// The retired rows are the customer's own now, so the org's newer catalog no longer carries them.
		processor.setCatalog({
			rows: rowsWithout({ table: "entitlements" }),
			readAt: 2000,
		});

		expect(await grantedFor({ processor })).toBe(1000);
	});
});

describe("a push the slot could not store", () => {
	test("leaves its customer's checks to the API, and pulls it, until a later write of it succeeds", async () => {
		const sqliteStore = openSqliteStore({
			databasePath: ":memory:",
			held: freshHeld(),
		});
		const catalogStore = openCatalogStore({ databasePath: ":memory:" });
		const journal = openJournal({ databasePath: ":memory:" });
		stores.push(sqliteStore, catalogStore, journal);
		let failing = false;
		const pulled: string[] = [];
		const processor = createSlotProcessor({
			ctx: {
				sqliteStore: {
					...sqliteStore,
					setSubjects: (params) => {
						if (failing) throw new Error("database or disk is full");
						return sqliteStore.setSubjects(params);
					},
				},
				catalogStore,
				logger: getAtomLogger(),
				subjectPulls: {
					request: ({ customerId }) => void pulled.push(customerId),
					settle: async () => {},
				},
				journal,
				openLocks: createOpenLocks(),
			},
		});
		const request = checkBalance({ requiredBalance: 5 });
		await processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
		);

		failing = true;
		await expect(
			processor.setSubject(
				subjectPushOf({ subject: storedSubjectWith({ balance: 0 }) }),
			),
		).rejects.toThrow("database or disk is full");
		expect(await forwardReasonOf(() => processor.check({ request }))).toBe(
			"subject_not_written",
		);
		expect(pulled).toEqual(["cus_1"]);

		failing = false;
		await processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 0 }) }),
		);
		expect((await checkResponseOf({ processor, request })).allowed).toBe(false);
	});
});

describe("a push that only acknowledges this Atom's own deductions keeps the cached view", () => {
	const ATOM_ID = "atom_1";

	/** The balance worker's state after it applied `entries`, each stamped with its source as the server stamps it. */
	const workerApplied = ({
		state,
		catalog,
		writerId,
		entries,
	}: {
		state: SubjectState;
		catalog: Catalog;
		writerId: string;
		entries: { seq: number; command: ReturnType<typeof owedCommand> }[];
	}): SubjectState =>
		entries.reduce(
			(current, { seq, command }) =>
				applyMutation({
					state: current,
					mutation: computeTrack({
						fullSubject: subjectStateToFullSubject({ state: current, catalog }),
						command: { ...command, source: { atomId: ATOM_ID, writerId, seq } },
					}),
				}),
			state,
		);

	/** `cus_1` holding 1,000 messages, then `deductions` journaled and its view read after each, as checks do. */
	const openDeducting = async ({ deductions }: { deductions: number }) => {
		const slot = openSlotProcessor();
		stores.push(slot);
		const stored = storedSubjectWith({ balance: 1000 });
		await slot.processor.setSubject(subjectPushOf({ subject: stored }));
		const read = () =>
			readCurrentSubject({
				ctx: slot.ctx,
				customerId: "cus_1",
				entityId: null,
			});
		read();
		for (let index = 0; index < deductions; index++) {
			await slot.journal.append({
				customerId: "cus_1",
				command: owedCommand({ commandId: `deduct_${index}`, value: 10 }),
			});
			read();
		}
		/** Autumn's push after it applied the first `acknowledged`, carrying `edit` on top when it applied something else too. */
		const push = async ({
			acknowledged,
			edit = (state) => state,
		}: {
			acknowledged: number;
			edit?: (state: SubjectState) => SubjectState;
		}) => {
			const entries = slot.journal
				.owed({ customerId: "cus_1" })
				.slice(0, acknowledged);
			const state = edit(
				workerApplied({
					state: stored.state,
					catalog: stored.catalog,
					writerId: slot.journal.writerId,
					entries,
				}),
			);
			const body = subjectPushOf({
				subject: { ...stored, state, readAt: 2000 },
			});
			await slot.processor.setSubject({
				customerId: body.customerId,
				body: JSON.stringify({
					...JSON.parse(body.body),
					atom_seqs: { [slot.journal.writerId]: acknowledged },
				}),
			});
			return state;
		};
		return { ...slot, read, push };
	};

	/** Today's view: the pushed state with every entry still owed replayed on top, joined. */
	const rebuiltView = ({
		journal,
		state,
		catalog,
	}: {
		journal: ReturnType<typeof openSlotProcessor>["journal"];
		state: SubjectState;
		catalog: Catalog;
	}) =>
		subjectStateToFullSubject({
			state: replay.replayOwed({
				owed: journal.owed({ customerId: "cus_1" }),
				state,
				catalog,
			}),
			catalog,
		});

	const foldStatsDelta = (
		before: ReturnType<typeof readViewFoldThreadStats>,
	) => {
		const after = readViewFoldThreadStats();
		const grew = (Object.keys(after) as (keyof typeof after)[]).filter(
			(field) => after[field] > before[field],
		);
		return Object.fromEntries(
			grew.map((field) => [field, after[field] - before[field]]),
		);
	};

	test("a push acknowledging the deductions it was read after keeps the fold: the view is byte-identical to a rebuild, and nothing is replayed", async () => {
		const slot = await openDeducting({ deductions: 5 });
		const before = readViewFoldThreadStats();
		const state = await slot.push({ acknowledged: 3 });
		const replayed = spyOn(replay, "replayOwed");

		const view = slot.read();
		replayed.mockRestore();

		expect(replayed).not.toHaveBeenCalled();
		expect(foldStatsDelta(before)).toEqual({ viewFoldKept: 1 });
		expect(JSON.stringify(view.fullSubject)).toBe(
			JSON.stringify(
				rebuiltView({ journal: slot.journal, state, catalog: view.catalog }),
			),
		);
	});

	test("a push acknowledging only some of a burst keeps the fold, and the deductions it has not seen stay in the view", async () => {
		const slot = await openDeducting({ deductions: 5 });
		const before = readViewFoldThreadStats();

		await slot.push({ acknowledged: 2 });
		await slot.journal.append({
			customerId: "cus_1",
			command: owedCommand({ commandId: "deduct_after_push", value: 10 }),
		});

		expect(slot.journal.owed({ customerId: "cus_1" })).toHaveLength(4);
		expect(
			(
				await checkResponseOf({
					processor: slot.processor,
					request: checkRequestFor(),
				})
			).balance?.remaining,
		).toBe(940);
		expect(foldStatsDelta(before)).toEqual({ viewFoldKept: 1 });
	});

	test("a push with the rows the deductions leave but another revision keeps the fold, counting on from Autumn's revision", async () => {
		const slot = await openDeducting({ deductions: 5 });
		const before = readViewFoldThreadStats();

		const state = await slot.push({
			acknowledged: 3,
			edit: (pushed) => ({ ...pushed, revision: 0 }),
		});
		const view = slot.read();

		expect(foldStatsDelta(before)).toEqual({ viewFoldKept: 1 });
		expect(JSON.stringify(view.fullSubject)).toBe(
			JSON.stringify(
				rebuiltView({ journal: slot.journal, state, catalog: view.catalog }),
			),
		);
		expect(view.fullSubject.revision).toBe(2);
	});

	test.each([
		[
			"a changed balance",
			(state: SubjectState): SubjectState => ({
				...state,
				customerEntitlements: state.customerEntitlements.map((row) => ({
					...row,
					balance: row.balance + 100,
				})),
			}),
			1050,
			"viewFoldRebuiltState",
		],
	])(
		"a push acknowledging the deductions that also carries %s rebuilds the view from the push, counted by the guard it failed",
		async (_change, edit, remaining, reason) => {
			const slot = await openDeducting({ deductions: 5 });
			const before = readViewFoldThreadStats();

			await slot.push({ acknowledged: 3, edit });

			expect(
				(
					await checkResponseOf({
						processor: slot.processor,
						request: checkRequestFor(),
					})
				).balance?.remaining,
			).toBe(remaining);
			expect(foldStatsDelta(before)).toEqual({
				viewFoldRebuilt: 1,
				[reason]: 1,
			});
		},
	);
});
