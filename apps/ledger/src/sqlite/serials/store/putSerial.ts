import { sql } from "drizzle-orm";
import type { CommandResult } from "../../../api/types/commandResult.js";
import { definePreparedQuery } from "../../common/prepared/definePreparedQuery.js";
import { serials } from "../../common/schema/serials.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

const putStatement = definePreparedQuery({
	build: (db) =>
		db
			.insert(serials)
			.values({
				command_id: sql`${sql.placeholder("commandId")}`,
				result: sql`${sql.placeholder("result")}`,
			})
			.onConflictDoUpdate({
				target: serials.command_id,
				set: { result: sql`${sql.placeholder("result")}` },
			})
			.prepare(),
});

export const putSerial = ({
	ctx,
	commandId,
	result,
}: {
	ctx: SqliteContext;
	commandId: string;
	result: CommandResult;
}): void => {
	putStatement({ ctx }).run({ commandId, result: JSON.stringify(result) });
};
