import { afterEach, describe, expect, test } from "bun:test";
import type { CatalogRow } from "@autumn/balance-engine";
import { CheckExpand } from "@autumn/shared";
import {
	createCatalogRowsFor,
	createState,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { getAtomLogger } from "../../../src/lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../../../src/processor/createSlotProcessor.js";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import { openCatalogStore } from "../../../src/state/openCatalogStore.js";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import {
	checkRequestFor,
	checkResponseOf,
	forwardReasonOf,
	freshHeld,
	oldestApiVersion,
	storedEntitySubjectWith,
	storedSubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";

const stores: { close(): void }[] = [];
const createProcessor = () => {
	const sqliteStore = openSqliteStore({
		databasePath: ":memory:",
		held: freshHeld(),
	});
	const catalogStore = openCatalogStore({ databasePath: ":memory:" });
	stores.push(sqliteStore, catalogStore);
	const processor = createSlotProcessor({
		ctx: { sqliteStore, catalogStore, logger: getAtomLogger() },
	});
	return {
		setSubject: processor.setSubject,
		setCatalog: catalogStore.set,
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
