import { schemas } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { PostgresDb } from "../../createPostgresDb.js";

// Plain rows (no joins): the ledger mirrors each table separately.
export const listRowsByInternalCustomerId = ({
	db,
	internalCustomerId,
}: {
	db: PostgresDb;
	internalCustomerId: string;
}) =>
	db.query.customerEntitlements.findMany({
		where: eq(
			schemas.customerEntitlements.internal_customer_id,
			internalCustomerId,
		),
	});
