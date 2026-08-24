import { eq, sql } from "drizzle-orm";
import { definePreparedQuery } from "../../common/prepared/definePreparedQuery.js";
import { customers } from "../../common/schema/customers.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

const deleteStatement = definePreparedQuery({
	build: (db) =>
		db
			.delete(customers)
			.where(eq(customers.internal_id, sql.placeholder("internalCustomerId")))
			.prepare(),
});

export const deleteByInternalId = ({
	ctx,
	internalCustomerId,
}: {
	ctx: SqliteContext;
	internalCustomerId: string;
}): void => {
	deleteStatement({ ctx }).run({ internalCustomerId });
};
