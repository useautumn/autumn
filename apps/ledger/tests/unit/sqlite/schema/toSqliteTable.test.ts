import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { pgTable, text as pgText, timestamp } from "drizzle-orm/pg-core";
import { createSqliteDb } from "../../../../src/sqlite/common/createSqliteDb.js";
import { customerEntitlements } from "../../../../src/sqlite/common/schema/customerEntitlements.js";
import { toCreateTableDdl } from "../../../../src/sqlite/common/schema/toCreateTableDdl.js";
import { toSqliteTable } from "../../../../src/sqlite/common/schema/toSqliteTable.js";

const row = {
	id: "ce_1",
	entitlement_id: "ent_1",
	internal_customer_id: "cus_1",
	internal_feature_id: "feat_1",
	balance: 12.5,
	created_at: 1_700_000_000,
	additional_balance: 0,
	separate_interval: false,
	is_pooled_balance: false,
	unlimited: true,
	cache_version: 7,
	entities: { ent_a: { id: "ent_a", balance: 3, adjustment: 0 } },
};

describe("toSqliteTable", () => {
	it("round-trips boolean, integer and json columns of the derived customer_entitlements", () => {
		const sqlite = createSqliteDb();
		sqlite.insert(customerEntitlements).values(row).run();

		const [stored] = sqlite.select().from(customerEntitlements).all();

		expect(stored?.id).toBe("ce_1");
		expect(stored?.unlimited).toBe(true);
		expect(stored?.cache_version).toBe(7);
		expect(stored?.entities).toEqual({
			ent_a: { id: "ent_a", balance: 3, adjustment: 0 },
		});
		expect(stored?.balance).toBe(12.5);
	});

	it("round-trips a timestamp column as epoch milliseconds", () => {
		const seenAt = new Date("2026-08-23T00:00:00.000Z");
		const events = toSqliteTable(
			pgTable("events", {
				id: pgText().primaryKey().notNull(),
				seen_at: timestamp("seen_at"),
			}),
		);

		const sqlite = drizzle(new Database(":memory:"));
		sqlite.run(sql.raw(toCreateTableDdl({ table: events })));
		sqlite.insert(events).values({ id: "evt_1", seen_at: seenAt }).run();

		const [stored] = sqlite.select().from(events).all();

		expect(stored?.seen_at).toEqual(seenAt);
	});
});
