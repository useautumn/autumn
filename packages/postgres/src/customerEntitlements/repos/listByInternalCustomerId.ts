import { schemas } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { PostgresDb } from "../../createPostgresDb.js";

export const listByInternalCustomerId = ({
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
		with: { entitlement: { with: { feature: true } } },
	});
