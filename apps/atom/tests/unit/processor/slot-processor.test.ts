import { afterEach, describe, expect, test } from "bun:test";
import {
	createCatalogFor,
	createState,
	occurredAt,
	org,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createSlotProcessor } from "../../../src/processor/createSlotProcessor.js";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import type { SqliteStore } from "../../../src/state/types/sqliteStore.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";

/** The fixture customer `cus_1` holding `balance` messages. */
const subjectWith = ({ balance }: { balance: number }): StoredSubject => {
	const state = createState({ balance });
	return { state, catalog: createCatalogFor({ state }), org, logOffset: 1n };
};

const checkFor = ({
	customerId = "cus_1",
	featureId = "messages",
	requiredBalance,
}: {
	customerId?: string;
	featureId?: string;
	requiredBalance: number;
}): CheckRequest => ({
	requestId: "req_check_1",
	customerId,
	featureId,
	requiredBalance,
	properties: null,
	occurredAt,
});

const sqliteStores: SqliteStore[] = [];
const createProcessor = () => {
	const sqliteStore = openSqliteStore({ databasePath: ":memory:" });
	sqliteStores.push(sqliteStore);
	return createSlotProcessor({ ctx: { sqliteStore } });
};
afterEach(() => {
	for (const sqliteStore of sqliteStores.splice(0)) sqliteStore.close();
});

describe("slot processor check", () => {
	test("a requirement within the stored balance is allowed", () => {
		const processor = createProcessor();
		processor.setSubject({ subject: subjectWith({ balance: 10 }) });

		expect(
			processor.check({ request: checkFor({ requiredBalance: 10 }) }),
		).toEqual({ allowed: true });
	});

	test("a requirement past the stored balance is refused", () => {
		const processor = createProcessor();
		processor.setSubject({ subject: subjectWith({ balance: 10 }) });

		expect(
			processor.check({ request: checkFor({ requiredBalance: 11 }) }),
		).toEqual({ allowed: false });
	});

	test("the answer follows the subject Autumn sent last", () => {
		const processor = createProcessor();
		processor.setSubject({ subject: subjectWith({ balance: 10 }) });
		processor.setSubject({ subject: subjectWith({ balance: 3 }) });

		expect(
			processor.check({ request: checkFor({ requiredBalance: 5 }) }),
		).toEqual({ allowed: false });
	});

	test("a customer Atom does not hold goes back to the API", () => {
		const processor = createProcessor();

		expect(
			processor.check({
				request: checkFor({ customerId: "cus_2", requiredBalance: 1 }),
			}),
		).toEqual({ askApi: "subject_not_stored" });
	});

	test("a feature missing from the subject's catalog goes back to the API", () => {
		const processor = createProcessor();
		processor.setSubject({ subject: subjectWith({ balance: 10 }) });

		expect(
			processor.check({
				request: checkFor({ featureId: "seats", requiredBalance: 1 }),
			}),
		).toEqual({ askApi: "feature_not_stored" });
	});
});
