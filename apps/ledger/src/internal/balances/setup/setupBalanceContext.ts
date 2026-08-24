import type { Command } from "../../../api/types/command.js";
import type { SqliteContext } from "../../../sqlite/common/types/sqliteContext.js";
import type { BalanceContext } from "../types/balanceContext.js";
import { setupFeatureContext } from "./setupFeatureContext.js";
import { setupSubjectContext } from "./setupSubjectContext.js";

export const setupBalanceContext = ({
	ctx,
	command,
}: {
	ctx: SqliteContext;
	command: Command;
}): BalanceContext => {
	const features = setupFeatureContext({ ctx, command });

	return {
		command,
		features,
		subject: setupSubjectContext({ ctx, command, features }),
	};
};
