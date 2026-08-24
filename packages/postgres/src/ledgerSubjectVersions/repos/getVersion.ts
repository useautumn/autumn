import { schemas } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { PostgresClient } from "../../createPostgresDb.js";

export const getVersion = async ({
	db,
	internalCustomerId,
}: {
	db: PostgresClient;
	internalCustomerId: string;
}): Promise<number | undefined> => {
	const rows = await db
		.select({ version: schemas.ledgerSubjectVersions.version })
		.from(schemas.ledgerSubjectVersions)
		.where(
			eq(
				schemas.ledgerSubjectVersions.internal_customer_id,
				internalCustomerId,
			),
		)
		.limit(1);

	return rows[0]?.version;
};
