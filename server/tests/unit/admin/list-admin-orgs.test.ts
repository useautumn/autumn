import { describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { queryMiddleware } from "@/honoMiddlewares/queryMiddleware.js";
import type { HonoEnv, RequestContext } from "@/honoUtils/HonoEnv.js";

mock.module("@/internal/misc/requestBlocks/requestBlockStore.js", () => ({
	getRequestBlockConfigFromSource: async () => ({ orgs: {} }),
}));

import { handleListAdminOrgs } from "@/internal/admin/handleListAdminOrgs.js";

const getOrganizationWhereSql = async (platform: boolean) => {
	let selectCount = 0;
	let organizationWhere: SQL | undefined;

	const db = {
		select: () => {
			selectCount += 1;

			if (selectCount === 1) {
				return {
					from: () => ({
						where: (condition: SQL | undefined) => {
							organizationWhere = condition;
							return {
								orderBy: () => ({ limit: async () => [] }),
							};
						},
					}),
				};
			}

			return {
				from: () => ({
					leftJoin: () => ({ where: async () => [] }),
				}),
			};
		},
	};

	const app = new Hono<HonoEnv>();
	app.use("*", queryMiddleware());
	app.use("*", async (c, next) => {
		c.set("ctx", {
			db,
			env: AppEnv.Sandbox,
			logger: {},
			org: { slug: "tests-org" },
		} as unknown as RequestContext);
		await next();
	});
	app.get("/admin/orgs", ...handleListAdminOrgs);

	const response = await app.request(
		`http://localhost/admin/orgs?platform=${platform}`,
	);

	expect(response.status).toBe(200);
	if (!organizationWhere)
		throw new Error("Organization query was not executed");
	return new PgDialect().sqlToQuery(organizationWhere).sql;
};

describe("list admin organizations", () => {
	test("separates platform and regular organization queries", async () => {
		const platformSql = await getOrganizationWhereSql(true);
		const regularSql = await getOrganizationWhereSql(false);

		expect(platformSql).toContain('"organizations"."created_by" is not null');
		expect(regularSql).toContain('"organizations"."created_by" is null');
	});
});
