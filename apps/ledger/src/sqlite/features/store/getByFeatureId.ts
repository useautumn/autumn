import type { AppEnv, Feature } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { definePreparedRowQuery } from "../../common/prepared/definePreparedRowQuery.js";
import { features } from "../../common/schema/features.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

const listRows = definePreparedRowQuery<Feature>({
	projection: {
		internal_id: features.internal_id,
		org_id: features.org_id,
		created_at: features.created_at,
		env: features.env,
		id: features.id,
		name: features.name,
		type: features.type,
		config: features.config,
		display: features.display,
		archived: features.archived,
		event_names: features.event_names,
		model_markups: features.model_markups,
		stripe_meter: features.stripe_meter,
	},
	build: ({ db, projection }) =>
		db
			.select(projection)
			.from(features)
			.where(
				and(
					eq(features.org_id, sql.placeholder("orgId")),
					eq(features.env, sql.placeholder("env")),
					eq(features.id, sql.placeholder("featureId")),
				),
			)
			.prepare(),
});

export const getByFeatureId = ({
	ctx,
	orgId,
	env,
	featureId,
}: {
	ctx: SqliteContext;
	orgId: string;
	env: AppEnv;
	featureId: string;
}): Feature | null =>
	listRows({ ctx, placeholderValues: { orgId, env, featureId } })[0] ?? null;
