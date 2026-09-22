import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { getAdminOrgTypeFilter } from "../../../src/internal/admin/handleListAdminOrgs";

const dialect = new PgDialect();

const compileFilter = ({ platform }: { platform?: string }) =>
	dialect.sqlToQuery(
		sql`SELECT 1 FROM organizations WHERE ${getAdminOrgTypeFilter({ platform })}`,
	);

describe("getAdminOrgTypeFilter", () => {
	test("regular searches only include root organizations", () => {
		const query = compileFilter({ platform: "false" });

		expect(query.sql).toContain('"organizations"."created_by" is null');
		expect(query.sql).not.toContain('"api_keys"');
	});

	test("platform searches require a platform-provisioned organization", () => {
		const query = compileFilter({ platform: "true" });

		expect(query.sql).toContain('"organizations"."created_by" is not null');
		expect(query.sql).toContain('"organizations"."is_sandbox" = $1');
		expect(query.sql).toContain('FROM "api_keys"');
		expect(query.sql).toContain('"api_keys"."org_id" = "organizations"."id"');
		expect(query.sql).toContain('"api_keys"."name" = $2');
		expect(query.params).toEqual([false, "Platform API Key"]);
	});
});
