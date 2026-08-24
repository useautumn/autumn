import { eq } from "drizzle-orm";
import {
	type CommandResult,
	CommandResultSchema,
} from "../../../../client/types/command.js";
import { serials } from "../../schema/serials.js";
import type { SqliteContext } from "../../types/sqliteContext.js";

export const getSerial = ({
	ctx,
	commandId,
}: {
	ctx: SqliteContext;
	commandId: string;
}): CommandResult | null => {
	const row = ctx.sqlite
		.select({ result: serials.result })
		.from(serials)
		.where(eq(serials.command_id, commandId))
		.get();
	if (!row) return null;

	const parsed = CommandResultSchema.safeParse(JSON.parse(row.result));
	return parsed.success ? parsed.data : null;
};
