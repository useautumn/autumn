import { eq, sql } from "drizzle-orm";
import {
	type CommandResult,
	CommandResultSchema,
} from "../../../api/types/commandResult.js";
import { definePreparedRowQuery } from "../../common/prepared/definePreparedRowQuery.js";
import { serials } from "../../common/schema/serials.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

const listRows = definePreparedRowQuery<{ result: string }>({
	projection: { result: serials.result },
	build: ({ db, projection }) =>
		db
			.select(projection)
			.from(serials)
			.where(eq(serials.command_id, sql.placeholder("commandId")))
			.prepare(),
});

// A stored result is the only row the ledger parses at read time: it is json
// the shard wrote itself, replayed verbatim to the caller.
export const getSerial = ({
	ctx,
	commandId,
}: {
	ctx: SqliteContext;
	commandId: string;
}): CommandResult | null => {
	const [row] = listRows({ ctx, placeholderValues: { commandId } });
	if (!row) return null;

	const parsed = CommandResultSchema.safeParse(JSON.parse(row.result));
	return parsed.success ? parsed.data : null;
};
