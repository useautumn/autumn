import { afterEach, describe, expect, test } from "bun:test";
import { CheckExpand } from "@autumn/shared";
import { getAtomLogger } from "../../../src/lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../../../src/processor/createSlotProcessor.js";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import { openCatalogStore } from "../../../src/state/openCatalogStore.js";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import {
	checkRequestFor,
	checkResponseOf,
	forwardReasonOf,
	oldestApiVersion,
	storedEntitySubjectWith,
	storedSubjectWith,
} from "../utils/atomFixtures.js";

const stores: { close(): void }[] = [];
const createProcessor = () => {
	const sqliteStore = openSqliteStore({ databasePath: ":memory:" });
	const catalogStore = openCatalogStore({ databasePath: ":memory:" });
	stores.push(sqliteStore, catalogStore);
	const processor = createSlotProcessor({
		ctx: { sqliteStore, catalogStore, logger: getAtomLogger() },
	});
	return {
		setSubject: processor.setSubject,
		check: ({ request }: { request: CheckRequest }) =>
			checkResponseOf({ processor, request }),
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
		await processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });

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
		await processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });

		const reply = await processor.check({
			request: checkBalance({ requiredBalance: 11 }),
		});

		expect(reply.allowed).toBe(false);
	});

	test("the answer follows the subject Autumn sent last", async () => {
		const processor = createProcessor();
		await processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });
		await processor.setSubject({ subject: storedSubjectWith({ balance: 3 }) });

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
		await processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });

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
		await processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });

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
		await processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });

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
		await processor.setSubject({
			subject: storedEntitySubjectWith({
				customerBalance: 10,
				entityBalance: 5,
			}),
		});

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
		await processor.setSubject({
			subject: storedEntitySubjectWith({
				customerBalance: 10,
				entityBalance: 5,
			}),
		});

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
		await processor.setSubject({
			subject: storedEntitySubjectWith({
				customerBalance: 10,
				entityBalance: 5,
				readAt: 1000,
			}),
		});

		await processor.setSubject({
			subject: storedSubjectWith({ balance: 2, readAt: 2000 }),
		});

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
		await processor.setSubject({ subject: storedSubjectWith({ balance: 10 }) });

		expect(
			await forwardReasonOf(() =>
				processor.check({ request: checkEntity({ requiredBalance: 1 }) }),
			),
		).toBe("entity_not_stored");
	});
});
