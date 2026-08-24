import { eq, sql } from "drizzle-orm";
import { definePreparedQuery } from "../../common/prepared/definePreparedQuery.js";
import { customerProducts } from "../../common/schema/customerProducts.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

const deleteStatement = definePreparedQuery({
	build: (db) =>
		db
			.delete(customerProducts)
			.where(
				eq(
					customerProducts.internal_customer_id,
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
