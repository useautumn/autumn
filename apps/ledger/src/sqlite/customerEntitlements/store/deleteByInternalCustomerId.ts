import { eq, sql } from "drizzle-orm";
import { definePreparedQuery } from "../../common/prepared/definePreparedQuery.js";
import { customerEntitlements } from "../../common/schema/customerEntitlements.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

const deleteStatement = definePreparedQuery({
	build: (db) =>
		db
			.delete(customerEntitlements)
			.where(
				eq(
					customerEntitlements.internal_customer_id,
					sql.placeholder("internalCustomerId"),
				),
			)
			.prepare(),
});

export const deleteByInternalCustomerId = ({
	ctx,
	internalCustomerId,
}: {
	ctx: SqliteContext;
	internalCustomerId: string;
}): void => {
	deleteStatement({ ctx }).run({ internalCustomerId });
};
