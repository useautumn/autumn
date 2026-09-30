import { afterEach, describe, expect, test } from "bun:test";
import { CheckExpand } from "@autumn/shared";
import { getAtomLogger } from "../../../src/lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../../../src/processor/createSlotProcessor.js";
import { openCatalogStore } from "../../../src/state/openCatalogStore.js";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import {
	checkRequestFor,
	forwardReasonOf,
	oldestApiVersion,
	storedSubjectWith,
} from "../utils/atomFixtures.js";

const stores: { close(): void }[] = [];
const createProcessor = () => {
	const sqliteStore = openSqliteStore({ databasePath: ":memory:" });
	const catalogStore = openCatalogStore({ databasePath: ":memory:" });
	stores.push(sqliteStore, catalogStore);
	return createSlotProcessor({
		ctx: { sqliteStore, catalogStore, logger: getAtomLogger() },
	});
};
afterEach(() => {
	for (const store of stores.splice(0)) store.close();
});

const checkBalance = ({ requiredBalance }: { requiredBalance: number }) =>
	checkRequestFor({ params: { required_balance: requiredBalance } });

describe("slot processor check", () => {
	test("a requirement within the stored balance is allowed, answered as the API answers", () => {
		const processor = createProcessor();
		processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });

		const reply = processor.check({
			request: checkBalance({ requiredBalance: 10 }),
		});

		expect(reply).toMatchObject({
			allowed: true,
			customer_id: "cus_1",
			required_balance: 10,
			balance: { feature_id: "messages", remaining: 10 },
		});
	});

	test("a requirement past the stored balance is refused", () => {
		const processor = createProcessor();
		processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });

		const reply = processor.check({
			request: checkBalance({ requiredBalance: 11 }),
		});

		expect(reply.allowed).toBe(false);
	});

	test("the answer follows the subject Autumn sent last", () => {
		const processor = createProcessor();
		processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });
		processor.setSubject({ subject: storedSubjectWith({ balance: 3 }) });

		const reply = processor.check({
			request: checkBalance({ requiredBalance: 5 }),
		});

		expect(reply).toMatchObject({
			allowed: false,
			balance: { remaining: 3 },
		});
	});

	test("an older API version gets that version's response", () => {
		const processor = createProcessor();
		processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });

		const reply = processor.check({
			request: checkRequestFor({ apiVersion: oldestApiVersion }),
		});

		// The oldest version's shape, not the latest the reply is typed as.
		expect<unknown>(reply).toEqual({
			allowed: true,
			balances: [{ feature_id: "messages", required: 1, balance: 10 }],
		});
	});

	test("the feature is expanded in the balance only when asked for", () => {
		const processor = createProcessor();
		processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });

		const plain = processor.check({ request: checkRequestFor() });
		const expanded = processor.check({
			request: checkRequestFor({
				query: { expand: [CheckExpand.BalanceFeature] },
			}),
		});

		expect(plain.balance?.feature).toBeUndefined();
		expect(expanded.balance?.feature?.id).toBe("messages");
	});

	test("a customer Atom does not hold goes to the API", () => {
		const processor = createProcessor();

		const request = checkRequestFor({ params: { customer_id: "cus_unknown" } });

		expect(forwardReasonOf(() => processor.check({ request }))).toBe(
			"customer_not_stored",
		);
	});

	test("a feature the org does not have, as far as Atom knows, goes to the API", () => {
		const processor = createProcessor();
		processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });

		const request = checkRequestFor({ params: { feature_id: "seats" } });

		expect(forwardReasonOf(() => processor.check({ request }))).toBe(
			"feature_not_stored",
		);
	});
});
