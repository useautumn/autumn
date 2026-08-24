import { schemas } from "@autumn/shared";
import { asc, gt } from "drizzle-orm";
import type { PostgresClient } from "../../createPostgresDb.js";

// The freshness ledger's tail: every customer a structural write touched since
// `since`, oldest first, so a poller can advance its cursor row by row.
export const listUpdatedSince = ({
	db,
	since,
	limit,
}: {
	db: PostgresClient;
	since: Date;
	limit: number;
}) =>
	db
		.select({
			org_id: schemas.customerLsns.org_id,
			env: schemas.customerLsns.env,
			customer_id: schemas.customerLsns.customer_id,
			internal_customer_id: schemas.customerLsns.internal_customer_id,
			updated_at: schemas.customerLsns.updated_at,
		})
		.from(schemas.customerLsns)
		.where(gt(schemas.customerLsns.updated_at, since))
		.orderBy(asc(schemas.customerLsns.updated_at))
		.limit(limit);
