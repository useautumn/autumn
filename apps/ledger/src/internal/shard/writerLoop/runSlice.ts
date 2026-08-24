import { sql } from "drizzle-orm";
import type { CommandResult } from "../../../api/types/commandResult.js";
import { serialStore } from "../../../sqlite/serials/store/serialStore.js";
import { subjectToKey } from "../../subjects/subjectToKey.js";
import type { QueuedCommand } from "../commandQueue/types/queuedCommand.js";
import type { CommandRunner } from "../types/commandRunner.js";
import type { ShardContext } from "../types/shardContext.js";
import { admitLoadedSubjects } from "./admitLoadedSubjects.js";
import { errorToCommandResult } from "./errorToCommandResult.js";
import type { StagedCommand } from "./types/stagedCommand.js";

// Bounds the synchronous fold section so the event loop keeps serving
// /commands under load; whatever is left folds in the next slice.
const SLICE_BUDGET_MS = 1;

const isSerializable = ({ result }: { result: CommandResult }) =>
	result.status >= 200 && result.status < 300;

const isResident = ({
	ctx,
	item,
}: {
	ctx: ShardContext;
	item: QueuedCommand;
}) => {
	const { org_id: orgId, env, customer_id: customerId } = item.command;
	return ctx.subjects.isResident({
		key: subjectToKey({ orgId, env, customerId }),
	});
};

const stageCommand = ({
	ctx,
	item,
	runCommand,
}: {
	ctx: ShardContext;
	item: QueuedCommand;
	runCommand: CommandRunner;
}): StagedCommand => {
	ctx.sqlite.run(sql`SAVEPOINT command`);

	try {
		const outcome = runCommand({ ctx, command: item.command });
		if (isSerializable({ result: outcome.result })) {
			serialStore.putSerial({
				ctx,
				commandId: item.command.id,
				result: outcome.result,
			});
		}
		ctx.sqlite.run(sql`RELEASE command`);
		return { ...outcome, item };
	} catch (error) {
		ctx.sqlite.run(sql`ROLLBACK TO command`);
		ctx.sqlite.run(sql`RELEASE command`);
		ctx.logger.error("Ledger command failed", error, {
			event: "ledger.command_failed",
			data: { command_id: item.command.id, kind: item.command.kind },
		});
		return {
			item,
			result: errorToCommandResult({ command: item.command, error }),
		};
	}
};

const isOverBudget = ({ startedAt }: { startedAt: number }) =>
	performance.now() - startedAt > SLICE_BUDGET_MS;

export const runSlice = ({
	ctx,
	arrived,
	runCommand,
}: {
	ctx: ShardContext;
	arrived: QueuedCommand[];
	runCommand: CommandRunner;
}): {
	staged: StagedCommand[];
	deferred: QueuedCommand[];
	awaitingImport: QueuedCommand[];
} => {
	admitLoadedSubjects({ ctx });
	ctx.sqlite.run(sql`BEGIN`);
	const startedAt = performance.now();
	const staged: StagedCommand[] = [];
	const awaitingImport: QueuedCommand[] = [];

	let index = 0;
	for (; index < arrived.length; index++) {
		if (isOverBudget({ startedAt })) break;

		const item = arrived[index];
		const stored = serialStore.getSerial({ ctx, commandId: item.command.id });
		if (stored) {
			item.resolve(stored);
			continue;
		}
		if (!isResident({ ctx, item })) {
			awaitingImport.push(item);
			continue;
		}
		staged.push(stageCommand({ ctx, item, runCommand }));
	}

	return { staged, deferred: arrived.slice(index), awaitingImport };
};
