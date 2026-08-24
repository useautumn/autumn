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
	db.query.customerProducts.findMany({
		where: eq(
			schemas.customerProducts.internal_customer_id,
			internalCustomerId,
		),
	});
