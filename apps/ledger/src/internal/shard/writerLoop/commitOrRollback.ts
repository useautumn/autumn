import { sql } from "drizzle-orm";
import type { ShardContext } from "../types/shardContext.js";
import type { StagedCommand } from "./types/stagedCommand.js";

export const commitOrRollback = async ({
	ctx,
	staged,
}: {
	ctx: ShardContext;
	staged: StagedCommand[];
}): Promise<void> => {
	try {
		// The append is the only await between BEGIN and COMMIT.
		await ctx.journal.append({
			entries: staged.flatMap((command) =>
				command.entry ? [command.entry] : [],
			),
		});
		ctx.sqlite.run(sql`COMMIT`);
		for (const command of staged) command.item.resolve(command.result);
	} catch (error) {
		ctx.sqlite.run(sql`ROLLBACK`);
		ctx.logger.error("Ledger journal append failed", error, {
			event: "ledger.journal_append_failed",
			data: { staged: staged.length },
		});
		for (const command of staged) {
			command.item.resolve({
				id: command.item.command.id,
				status: 503,
				body: { message: "ledger: journal unavailable" },
			});
		}
	}
};
