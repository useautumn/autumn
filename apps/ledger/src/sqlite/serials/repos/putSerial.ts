import type { CommandResult } from "../../../../client/types/command.js";
import { serials } from "../../schema/serials.js";
import type { SqliteContext } from "../../types/sqliteContext.js";

export const putSerial = ({
	ctx,
	commandId,
	result,
}: {
	ctx: SqliteContext;
	commandId: string;
	result: CommandResult;
}): void => {
	ctx.sqlite
		.insert(serials)
		.values({ command_id: commandId, result: JSON.stringify(result) })
		.onConflictDoUpdate({
			target: serials.command_id,
			set: { result: JSON.stringify(result) },
		})
		.run();
};
