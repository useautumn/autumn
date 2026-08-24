import { eq, sql } from "drizzle-orm";
import { definePreparedQuery } from "../../common/prepared/definePreparedQuery.js";
import { customerEntitlements } from "../../common/schema/customerEntitlements.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

const updateStatement = definePreparedQuery({
	build: (db) =>
		db
			.update(customerEntitlements)
			.set({
				balance: sql`${sql.placeholder("balance")}`,
				adjustment: sql`${sql.placeholder("adjustment")}`,
			})
			.where(eq(customerEntitlements.id, sql.placeholder("id")))
			.prepare(),
});

export const updateBalance = ({
	ctx,
	id,
	balance,
	adjustment,
}: {
	ctx: SqliteContext;
	id: string;
	balance: number;
	adjustment: number;
}): void => {
	updateStatement({ ctx }).run({ id, balance, adjustment });
};
