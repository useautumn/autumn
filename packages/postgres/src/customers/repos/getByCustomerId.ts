import { type AppEnv, schemas } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { PostgresDb } from "../../createPostgresDb.js";

export const getByCustomerId = ({
	db,
	orgId,
	env,
	customerId,
}: {
	db: PostgresDb;
	orgId: string;
	env: AppEnv;
	customerId: string;
}) =>
	db.query.customers.findFirst({
		where: and(
			eq(schemas.customers.org_id, orgId),
			eq(schemas.customers.env, env),
			eq(schemas.customers.id, customerId),
		),
	});
