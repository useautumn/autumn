/**
 * Row-ref probes decide catalog in-place retire vs delete. Prod FK is
 * RESTRICT, so expired cus_ents still count. Versionable CP counts stay
 * live-only (`has_customers` / migrate drafts).
 *
 * Red (current):  row-ref IN-list omits expired
 * Green (after):  row-ref IN-list includes expired; versionable counts do not
 */

import { expect, test } from "bun:test";
import {
	AppEnv,
	CusProductStatus,
	VERSIONABLE_CUSTOMER_STATUSES,
} from "@autumn/shared";
import chalk from "chalk";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildBoundedVersionableRowRefsQuery } from "@/internal/customers/cusProducts/repos/getBoundedVersionableRowRefs.js";
import {
	buildBoundedVersioningCustomerProductsQuery,
	buildVersionableEntitlementRefsQuery,
	buildVersionablePriceRefsQuery,
} from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

const dialect = new PgDialect();

const customerStatusesIn = ({
	query,
}: {
	query: Parameters<PgDialect["sqlToQuery"]>[0];
}): Set<string> => {
	const statuses = new Set<string>(Object.values(CusProductStatus));
	return new Set(
		dialect
			.sqlToQuery(query)
			.params.filter(
				(param): param is string =>
					typeof param === "string" && statuses.has(param),
			),
	);
};

const expectRowRefIncludesExpired = ({
	query,
}: {
	query: Parameters<PgDialect["sqlToQuery"]>[0];
}) => {
	const statuses = customerStatusesIn({ query });
	for (const status of VERSIONABLE_CUSTOMER_STATUSES) {
		expect(statuses.has(status), `missing versionable status ${status}`).toBe(
			true,
		);
	}
	expect(statuses.has(CusProductStatus.Expired)).toBe(true);
};

test(`${chalk.yellowBright("versioning row-refs: bounded ent probe includes expired")}`, () => {
	expectRowRefIncludesExpired({
		query: buildBoundedVersionableRowRefsQuery({
			targets: [{ id: "ent_1", internal_product_id: "prod_1" }],
			refTable: "customer_entitlements",
			targetColumn: "entitlement_id",
		}),
	});
});

test(`${chalk.yellowBright("versioning row-refs: entitlement refs query includes expired")}`, () => {
	expectRowRefIncludesExpired({
		query: buildVersionableEntitlementRefsQuery({
			internalProductIds: ["prod_1"],
			orgId: "org_1",
			env: AppEnv.Sandbox,
		}),
	});
});

test(`${chalk.yellowBright("versioning row-refs: price refs query includes expired")}`, () => {
	expectRowRefIncludesExpired({
		query: buildVersionablePriceRefsQuery({
			internalProductIds: ["prod_1"],
			orgId: "org_1",
			env: AppEnv.Sandbox,
		}),
	});
});

test(`${chalk.yellowBright("versioning row-refs: versionable CP counts still omit expired")}`, () => {
	const statuses = customerStatusesIn({
		query: buildBoundedVersioningCustomerProductsQuery({
			internalProductIds: ["prod_1"],
		}),
	});
	expect(statuses.has(CusProductStatus.Expired)).toBe(false);
	for (const status of VERSIONABLE_CUSTOMER_STATUSES) {
		expect(statuses.has(status)).toBe(true);
	}
});
