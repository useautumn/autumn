import type { AppEnv } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { definePreparedRowQuery } from "../../common/prepared/definePreparedRowQuery.js";
import { customers } from "../../common/schema/customers.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";
import type { SubjectCustomerRow } from "../types/subjectCustomerRow.js";

const listRows = definePreparedRowQuery<SubjectCustomerRow>({
	projection: { internal_id: customers.internal_id },
	build: ({ db, projection }) =>
		db
			.select(projection)
			.from(customers)
			.where(
				and(
					eq(customers.org_id, sql.placeholder("orgId")),
					eq(customers.env, sql.placeholder("env")),
					eq(customers.id, sql.placeholder("customerId")),
				),
			)
			.prepare(),
});

export const getByCustomerId = ({
	ctx,
	orgId,
	env,
	customerId,
}: {
	ctx: SqliteContext;
	orgId: string;
	env: AppEnv;
	customerId: string;
}): SubjectCustomerRow | null =>
	listRows({ ctx, placeholderValues: { orgId, env, customerId } })[0] ?? null;
