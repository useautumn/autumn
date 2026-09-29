import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	claimCustomerByEmail,
	claimCustomerByEmailSql,
} from "../../../src/customers/repos/claimCustomerByEmail.js";

const dialect = new PgDialect();
const flatten = (text: string) => text.replace(/\s+/g, " ").trim();
const ctx = { orgId: "org_1", env: "sandbox" };

describe("claimCustomerByEmail", () => {
	test("one UPDATE gives the email-only customer with this email the id, scoped to the org and env", () => {
		const query = dialect.sqlToQuery(
			claimCustomerByEmailSql({
				ctx,
				customerId: "cus_ada",
				email: "Ada@x.com",
			}),
		);
		expect(flatten(query.sql)).toBe(
			"UPDATE customers SET id = $1 WHERE org_id = $2 AND env = $3 AND id IS NULL AND email IS NOT NULL AND email != '' AND lower(email) = lower($4) RETURNING internal_id",
		);
		expect(query.params).toEqual(["cus_ada", "org_1", "sandbox", "Ada@x.com"]);
	});

	test("the claimed row's internal id, or null when there was none to claim", async () => {
		const claimed = await claimCustomerByEmail({
			ctx: { ...ctx, db: { execute: async () => [{ internal_id: "ci_1" }] } },
			customerId: "cus_ada",
			email: "ada@x.com",
		});
		const none = await claimCustomerByEmail({
			ctx: { ...ctx, db: { execute: async () => [] } },
			customerId: "cus_ada",
			email: "ada@x.com",
		});
		expect(claimed).toBe("ci_1");
		expect(none).toBeNull();
	});
});
