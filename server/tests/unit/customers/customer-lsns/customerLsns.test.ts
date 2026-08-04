import { beforeEach, describe, expect, it, mock } from "bun:test";

const errorLog = mock((..._args: unknown[]) => {});
mock.module("@/external/logtail/logtailUtils.js", () => ({
	logger: {
		info: mock(() => {}),
		warn: mock(() => {}),
		error: errorLog,
		debug: mock(() => {}),
		child: () => ({}),
	},
}));

const { markCustomerUpdatedAt, markCustomersUpdatedAtByInternalIds } =
	await import("@/internal/customers/customerLsns/markCustomerUpdatedAt.js");
const { CUSTOMER_FRESHNESS_WINDOW_S, isCustomerRecentlyUpdated } = await import(
	"@/internal/customers/customerLsns/isCustomerRecentlyUpdated.js"
);
const { REPLICA_LAG_MAX_MS } = await import("@/db/probes/replicaLagProbe.js");

type FakeDb = {
	$client: object;
	execute: ReturnType<typeof mock>;
	// biome-ignore lint/suspicious/noExplicitAny: test double
} & any;

const makeFakeDb = (
	impl: (query: unknown) => Promise<unknown[]> = async () => [],
): FakeDb => ({ $client: {}, execute: mock(impl) });

const sqlTextOf = (query: unknown): string => {
	// Drizzle SQL objects expose their chunks via queryChunks; join string parts.
	const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? [];
	return chunks
		.map((chunk) =>
			Array.isArray((chunk as { value?: string[] }).value)
				? (chunk as { value: string[] }).value.join("")
				: "",
		)
		.join("");
};

const markParams = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	internalCustomerId: "internal_1",
};

beforeEach(() => {
	errorLog.mockClear();
});

describe("markCustomerUpdatedAt", () => {
	it("fires a single ledger upsert keyed on (org_id, env, customer_id) using Postgres now()", async () => {
		const db = makeFakeDb();

		await markCustomerUpdatedAt({ db, ...markParams });

		expect(db.execute).toHaveBeenCalledTimes(1);
		const text = sqlTextOf(db.execute.mock.calls[0][0]);
		expect(text).toContain("INSERT INTO customer_lsns");
		expect(text).toContain("ON CONFLICT (org_id, env, customer_id)");
		expect(text).toContain("DO UPDATE SET updated_at = now()");
		expect(text).toContain(
			"COALESCE(EXCLUDED.internal_customer_id, customer_lsns.internal_customer_id)",
		);
		// DB clock only — a JS timestamp must never be bound into the upsert.
		expect(text).not.toContain(String(Date.now()).slice(0, 8));
	});

	it("retries once on failure and succeeds silently", async () => {
		let calls = 0;
		const db = makeFakeDb(async () => {
			calls++;
			if (calls === 1) throw new Error("transient");
			return [];
		});

		await markCustomerUpdatedAt({ db, ...markParams });

		expect(db.execute).toHaveBeenCalledTimes(2);
		expect(errorLog).not.toHaveBeenCalled();
	});

	it("never throws: after retry fails it logs customer_lsns_mark_failed", async () => {
		const db = makeFakeDb(async () => {
			throw new Error("db down");
		});

		await expect(
			markCustomerUpdatedAt({ db, ...markParams }),
		).resolves.toBeUndefined();

		expect(db.execute).toHaveBeenCalledTimes(2);
		expect(errorLog).toHaveBeenCalledTimes(1);
		expect(errorLog.mock.calls[0][0]).toMatchObject({
			type: "customer_lsns_mark_failed",
			customer_id: "cus_1",
		});
	});
});

describe("markCustomersUpdatedAtByInternalIds", () => {
	it("resolves identity through customers in a single statement", async () => {
		const db = makeFakeDb();

		await markCustomersUpdatedAtByInternalIds({
			db,
			internalCustomerIds: ["internal_1", "internal_2", "internal_1"],
		});

		expect(db.execute).toHaveBeenCalledTimes(1);
		const text = sqlTextOf(db.execute.mock.calls[0][0]);
		expect(text).toContain("INSERT INTO customer_lsns");
		expect(text).toContain("FROM customers");
		expect(text).toContain("ON CONFLICT (org_id, env, customer_id)");
		expect(text).toContain("DO UPDATE SET updated_at = now()");
	});

	it("no-ops without touching the db when there are no ids", async () => {
		const db = makeFakeDb();

		await markCustomersUpdatedAtByInternalIds({ db, internalCustomerIds: [] });

		expect(db.execute).not.toHaveBeenCalled();
	});

	it("never throws: retry then customer_lsns_mark_failed", async () => {
		const db = makeFakeDb(async () => {
			throw new Error("db down");
		});

		await expect(
			markCustomersUpdatedAtByInternalIds({
				db,
				internalCustomerIds: ["internal_1"],
			}),
		).resolves.toBeUndefined();

		expect(db.execute).toHaveBeenCalledTimes(2);
		expect(errorLog).toHaveBeenCalledTimes(1);
		expect(errorLog.mock.calls[0][0]).toMatchObject({
			type: "customer_lsns_mark_failed",
		});
	});
});

describe("isCustomerRecentlyUpdated", () => {
	it("stays equal to the replica lag bound the ledger window must cover", () => {
		expect(CUSTOMER_FRESHNESS_WINDOW_S * 1000).toBe(REPLICA_LAG_MAX_MS);
	});

	it("queries the freshness window against the DB clock and maps rows to a boolean", async () => {
		const db = makeFakeDb(async () => [{ fresh: true }]);

		const fresh = await isCustomerRecentlyUpdated({
			db,
			orgId: "org_1",
			env: "sandbox",
			customerId: "cus_1",
		});

		expect(fresh).toBe(true);
		const text = sqlTextOf(db.execute.mock.calls[0][0]);
		expect(text).toContain("FROM customer_lsns");
		expect(text).toContain("updated_at > now() - make_interval");
		expect(text).toContain("LIMIT 1");
	});

	it("returns false when no row is inside the window", async () => {
		const db = makeFakeDb(async () => []);

		const fresh = await isCustomerRecentlyUpdated({
			db,
			orgId: "org_1",
			env: "sandbox",
			customerId: "cus_1",
		});

		expect(fresh).toBe(false);
	});
});
