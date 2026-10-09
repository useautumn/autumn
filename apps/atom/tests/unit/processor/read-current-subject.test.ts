import { afterEach, describe, expect, test } from "bun:test";
import type { CatalogRow } from "@autumn/balance-engine";
import {
	createCatalogFor,
	createCatalogRowsFor,
	createState,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { getAtomLogger } from "../../../src/lib/logging/getAtomLogger.js";
import { readCurrentSubject } from "../../../src/processor/actions/readCurrentSubject/readCurrentSubject.js";
import type { SlotProcessorContext } from "../../../src/processor/types/slotProcessor.js";
import { openCatalogStore } from "../../../src/state/openCatalogStore.js";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import {
	atomOrg,
	forwardReasonOf,
	freshHeld,
	noFolderPulls,
	storedEntitySubjectWith,
} from "../utils/atomFixtures.js";

const state = createState({ balance: 10 });
const customerCatalog = createCatalogFor({ state });
const sharedRows = createCatalogRowsFor({ state });

/** The same row as the customer's copy, edited since: its allowance is the only difference. */
const withAllowance = ({
	row,
	allowance,
}: {
	row: CatalogRow;
	allowance: number;
}): CatalogRow =>
	row.table === "entitlements"
		? { table: "entitlements", row: { ...row.row, allowance } }
		: row;

const closers: (() => void)[] = [];
const createContext = ({
	shared,
}: {
	/** Null leaves the Atom without a shared catalog; rows are read after the customer. */
	shared: CatalogRow[] | null;
}): SlotProcessorContext => {
	const sqliteStore = openSqliteStore({
		databasePath: ":memory:",
		held: freshHeld(),
	});
	const catalogStore = openCatalogStore({ databasePath: ":memory:" });
	closers.push(
		() => sqliteStore.close(),
		() => catalogStore.close(),
	);
	sqliteStore.setSubject({
		subject: {
			state,
			catalog: customerCatalog,
			org: atomOrg,
			logOffset: 1n,
			readAt: 1000,
			customerVersion: 0n,
		},
	});
	if (shared) catalogStore.set({ rows: shared, readAt: 2000 });
	return {
		sqliteStore,
		catalogStore,
		logger: getAtomLogger(),
		subjectPulls: noFolderPulls,
	};
};
afterEach(() => {
	for (const close of closers.splice(0)) close();
});

const allowanceOf = ({ ctx }: { ctx: SlotProcessorContext }) => {
	const subject = readCurrentSubject({
		ctx,
		customerId: "cus_1",
		entityId: null,
	});
	const { customer_products, extra_customer_entitlements } =
		subject.fullSubject;
	const [customerEntitlement] = [
		...customer_products.flatMap((product) => product.customer_entitlements),
		...extra_customer_entitlements,
	];
	return customerEntitlement?.entitlement.allowance;
};

describe("the subject a check runs on", () => {
	test("is joined to the shared catalog when that was read after the customer", () => {
		const ctx = createContext({
			shared: sharedRows.map((row) => withAllowance({ row, allowance: 777 })),
		});

		expect(allowanceOf({ ctx })).toBe(777);
	});

	test("is joined to the customer's own copy when there is no shared catalog", () => {
		const ctx = createContext({ shared: null });
		const ownAllowance = Object.values(customerCatalog.entitlements)[0]
			?.allowance;

		expect(ownAllowance).not.toBe(777);
		expect(allowanceOf({ ctx })).toBe(ownAllowance);
	});

	test("is left to the API when Atom does not hold the customer", async () => {
		const ctx = createContext({ shared: sharedRows });

		expect(
			await forwardReasonOf(() =>
				readCurrentSubject({ ctx, customerId: "cus_unknown", entityId: null }),
			),
		).toBe("customer_not_stored");
	});

	test("carries every feature Atom knows for the org, not only the customer's own", () => {
		const seats = sharedRows.flatMap((row) =>
			row.table === "features"
				? [
						{
							table: "features" as const,
							row: { ...row.row, id: "seats", internal_id: "feat_seats" },
						},
					]
				: [],
		);
		const ctx = createContext({ shared: [...sharedRows, ...seats] });

		const subject = readCurrentSubject({
			ctx,
			customerId: "cus_1",
			entityId: null,
		});

		expect(subject.features.map((feature) => feature.id).sort()).toEqual([
			"messages",
			"seats",
		]);
	});

	test("is joined once per change to its parts: checks share one frozen view until the next push", () => {
		const ctx = createContext({ shared: null });
		const read = () =>
			readCurrentSubject({ ctx, customerId: "cus_1", entityId: null });

		const first = read();
		expect(read()).toBe(first);
		expect(Object.isFrozen(first.fullSubject)).toBe(true);

		ctx.sqliteStore.setSubject({
			subject: {
				state,
				catalog: customerCatalog,
				org: atomOrg,
				logOffset: 2n,
				readAt: 1001,
				customerVersion: 0n,
			},
		});

		expect(read()).not.toBe(first);
	});
});

describe("an entity read before its customer's latest evict", () => {
	/** cus_1 stored at offset 1, with no version yet, and its entity ent_42 at `entityOffset`. */
	const contextWithEntity = ({ entityOffset }: { entityOffset: bigint }) => {
		const ctx = createContext({ shared: null });
		pushEntity({ ctx, logOffset: entityOffset, readAt: 1100 });
		return ctx;
	};
	const pushEntity = ({
		ctx,
		logOffset,
		readAt,
	}: {
		ctx: SlotProcessorContext;
		logOffset: bigint;
		readAt: number;
	}) =>
		ctx.sqliteStore.setSubject({
			subject: {
				...storedEntitySubjectWith({
					customerBalance: 10,
					entityBalance: 5,
					readAt,
				}),
				logOffset,
			},
		});
	const pushCustomerEvictedAt = ({
		ctx,
		customerVersion,
	}: {
		ctx: SlotProcessorContext;
		customerVersion: bigint;
	}) =>
		ctx.sqliteStore.setSubject({
			subject: {
				state,
				catalog: customerCatalog,
				org: atomOrg,
				logOffset: customerVersion,
				readAt: 1200,
				customerVersion,
			},
		});
	const readEntity = (ctx: SlotProcessorContext) => () =>
		readCurrentSubject({ ctx, customerId: "cus_1", entityId: "ent_42" });

	test("is answered as before while no evict has been heard of", () => {
		const ctx = contextWithEntity({ entityOffset: 100n });

		expect(readEntity(ctx)()).toBeDefined();
	});

	test("is left to the API as stale, while the customer itself is still answered", async () => {
		const ctx = contextWithEntity({ entityOffset: 100n });

		pushCustomerEvictedAt({ ctx, customerVersion: 140n });

		expect(await forwardReasonOf(readEntity(ctx))).toBe("entity_stale");
		expect(
			readCurrentSubject({ ctx, customerId: "cus_1", entityId: null }),
		).toBeDefined();
	});

	test("is answered again once a push read after the evict lands, and at the evict's own offset", () => {
		const after = contextWithEntity({ entityOffset: 100n });
		pushCustomerEvictedAt({ ctx: after, customerVersion: 140n });
		pushEntity({ ctx: after, logOffset: 150n, readAt: 1300 });
		const atEvict = contextWithEntity({ entityOffset: 140n });
		pushCustomerEvictedAt({ ctx: atEvict, customerVersion: 140n });

		expect(readEntity(after)()).toBeDefined();
		expect(readEntity(atEvict)()).toBeDefined();
	});

	test("stays stale when a late push of it, still from before the evict, lands", async () => {
		const ctx = contextWithEntity({ entityOffset: 100n });
		pushCustomerEvictedAt({ ctx, customerVersion: 140n });

		pushEntity({ ctx, logOffset: 120n, readAt: 1300 });

		expect(await forwardReasonOf(readEntity(ctx))).toBe("entity_stale");
	});

	test("an entity read after the evict, then a late push of that evict, is still answered", () => {
		const ctx = contextWithEntity({ entityOffset: 150n });

		pushCustomerEvictedAt({ ctx, customerVersion: 140n });

		expect(readEntity(ctx)()).toBeDefined();
	});
});
