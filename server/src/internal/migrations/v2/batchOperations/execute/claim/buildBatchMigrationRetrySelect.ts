import type { MigrationItemRunStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Committed changes can invalidate the live filter. An explicit retry still
 * reaches those saved customers, scoped to the migration and requested IDs. */
export const buildBatchMigrationRetrySelect = ({
	ctx,
	migrationInternalId,
	retryItemStatuses,
	only,
	afterInternalId,
	limit,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	retryItemStatuses: MigrationItemRunStatus[];
	only?: string[] | null;
	afterInternalId?: string;
	limit: number;
}) => sql`
	SELECT customer.internal_id, customer.id, customer.name, customer.email
	FROM migration_item_runs AS mir
	INNER JOIN customers AS customer ON customer.internal_id = mir.item_id
	WHERE mir.migration_internal_id = ${migrationInternalId}
		AND mir.item_kind = 'customer'
		AND mir.dry_run = false
		AND mir.unpublished_changes IS NOT NULL
		AND mir.status = ANY(${sql.param(retryItemStatuses)}::text[])
		AND customer.org_id = ${ctx.org.id}
		AND customer.env = ${ctx.env}
		${only ? sql`AND customer.id = ANY(${sql.param(only)}::text[])` : sql``}
		${afterInternalId ? sql`AND customer.internal_id < ${afterInternalId}` : sql``}
	ORDER BY customer.internal_id COLLATE "C" DESC
	LIMIT ${limit}
`;
