import { type AppEnv, schemas } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { PostgresDb } from "../../createPostgresDb.js";

export const listByOrgEnv = ({
	db,
	orgId,
	env,
}: {
	db: PostgresDb;
	orgId: string;
	env: AppEnv;
}) =>
	db.query.features.findMany({
		where: and(
			eq(schemas.features.org_id, orgId),
			eq(schemas.features.env, env),
		),
	});
