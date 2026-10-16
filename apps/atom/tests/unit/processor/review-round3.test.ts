import { afterEach, describe, expect, test } from "bun:test";
import { getAtomLogger } from "../../../src/lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../../../src/processor/createSlotProcessor.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import { createLaggingEntities } from "../../../src/state/laggingEntities/createLaggingEntities.js";
import { openCatalogStore } from "../../../src/state/openCatalogStore.js";
import { createOpenLocks } from "../../../src/state/openLocks/createOpenLocks.js";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import {
	checkRequestFor,
	checkResponseOf,
	freshHeld,
	noFolderPulls,
	storedEntitySubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";

const stores: { close(): void }[] = [];
afterEach(() => {
	for (const store of stores.splice(0)) store.close();
});

const createProcessor = () => {
	const sqliteStore = openSqliteStore({
		databasePath: ":memory:",
		held: freshHeld(),
	});
	const catalogStore = openCatalogStore({ databasePath: ":memory:" });
	const journal = openJournal({ databasePath: ":memory:" });
	stores.push(sqliteStore, catalogStore, journal);
	return createSlotProcessor({
		ctx: {
			sqliteStore,
			catalogStore,
			logger: getAtomLogger(),
			subjectPulls: noFolderPulls,
			journal,
			openLocks: createOpenLocks(),
			laggingEntities: createLaggingEntities(),
		},
	});
};

describe("equal-version guard (review round 3 of #4605)", () => {
	test("a newer entity view whose customer part is now empty clears the customer's rows, on a single replica", async () => {
		const processor = createProcessor();
		const whole = storedEntitySubjectWith({
			customerBalance: 10,
			entityBalance: 5,
			readAt: 1000,
		});
		await processor.setSubject(subjectPushOf({ subject: whole }));
		// Later, the customer-level plan is gone: Autumn's next entity view carries the entity's rows only.
		const customerPlanGone = {
			...whole,
			readAt: 2000,
			logOffset: 2n,
			state: {
				...whole.state,
				customerProducts: whole.state.customerProducts.filter(
					(row) => row.internal_entity_id !== null,
				),
				customerEntitlements: whole.state.customerEntitlements.filter(
					(row) => row.internal_entity_id !== null,
				),
			},
		};

		await processor.setSubject(subjectPushOf({ subject: customerPlanGone }));

		const customerCheck = await checkResponseOf({
			processor,
			request: checkRequestFor({ params: { required_balance: 10 } }),
		}).catch(() => ({ allowed: "forwarded" }));
		expect(customerCheck.allowed).not.toBe(true);
	});
});
