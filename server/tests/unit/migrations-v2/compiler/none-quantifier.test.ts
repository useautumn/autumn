import { describe, expect, test } from "bun:test";
import { filterToIr } from "@autumn/shared/api/migrations/compiler/filterToIr/filterToIr.js";
import type { ResolutionContext } from "@autumn/shared/api/migrations/compiler/filterToIr/resolutionContext.js";
import { irToSql } from "@autumn/shared/api/migrations/compiler/irToSql/irToSql.js";
import { customerRegistry } from "@autumn/shared/api/migrations/compiler/registry/customerRegistry.js";
import type { CustomerFilter } from "@autumn/shared/api/migrations/filters/customerFilter.js";

const ctx: ResolutionContext = { features: [] };
const ambient = { orgId: "org_test", env: "sandbox" };

function compile(filter: CustomerFilter) {
	const ir = filterToIr({ filter, ctx });
	return irToSql({ ir, root: customerRegistry, ambient });
}

describe("$none quantifier", () => {
	test("$none with empty filter selects customers with no active plans", () => {
		const { sql } = compile({ plan: { $none: {} } });
		expect(sql).toContain("NOT EXISTS");
	});

	test("$none with plan_id $in is the empty-inclusive 'not on plan' negation", () => {
		const { sql, params } = compile({
			plan: { $none: { plan_id: { $in: ["pro"] } } },
		});
		expect(sql).toContain("NOT EXISTS");
		expect(params).toContain("pro");
	});

	test("$none with plan_id filter selects customers without that plan", () => {
		const { sql, params } = compile({
			plan: { $none: { plan_id: "pro" } },
		});
		expect(sql).toContain("NOT EXISTS");
		expect(sql).toContain("p.id = ?");
		expect(params).toContain("pro");
	});

	test("$some still produces EXISTS", () => {
		const { sql } = compile({
			plan: { $some: { plan_id: "pro" } },
		});
		expect(sql).not.toContain("NOT EXISTS");
		expect(sql).toContain("EXISTS");
	});

	test("bare plan filter (implicit $some) produces EXISTS", () => {
		const { sql } = compile({
			plan: { plan_id: "pro" },
		});
		expect(sql).not.toContain("NOT EXISTS");
		expect(sql).toContain("EXISTS");
	});
});
