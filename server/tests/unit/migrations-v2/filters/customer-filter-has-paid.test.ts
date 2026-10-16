/**
 * S2b contract: `customer.has_paid` is a shared CustomerFilter field.
 *
 *   - CustomerFilterSchema keeps `has_paid` (it used to strip it to `{}`).
 *   - compileFilter renders it as a customer-level EXISTS over paid invoices
 *     (`status = 'paid' AND total > 0`, any time), bound `= ?` like `plan.paid`.
 */

import { describe, expect, test } from "bun:test";
import { compileFilter } from "@autumn/shared/api/migrations/compiler/compileFilter.js";
import { CustomerFilterSchema } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { contexts } from "@tests/utils/fixtures/db/contexts";

const ctx = contexts.create({ features: [] });
const ambient = { orgId: "org_test", env: "live" };

const HAS_PAID_EXISTS =
	"EXISTS (SELECT 1 FROM invoices i WHERE i.internal_customer_id = c.internal_id AND i.status = 'paid' AND i.total > 0)";

const normalize = (sql: string) =>
	sql.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

describe("customer.has_paid filter", () => {
	test("schema keeps has_paid, top-level and in branches", () => {
		expect(CustomerFilterSchema.parse({ has_paid: true })).toEqual({
			has_paid: true,
		});
		expect(CustomerFilterSchema.parse({ $or: [{ has_paid: false }] })).toEqual({
			$or: [{ has_paid: false }],
		});
	});

	test.each([true, false])(
		"has_paid: %p → paid-invoice EXISTS = ?",
		(hasPaid) => {
			const result = compileFilter({
				filter: { has_paid: hasPaid },
				ctx: { features: ctx.features },
				ambient,
			});

			expect(normalize(result.sql)).toBe(
				`c.org_id = ? AND c.env = ? AND ${HAS_PAID_EXISTS} = ?`,
			);
			expect(result.params).toEqual(["org_test", "live", hasPaid]);
		},
	);
});
