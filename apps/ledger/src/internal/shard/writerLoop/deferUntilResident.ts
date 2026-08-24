import { importSubject } from "../../subjects/actions/importSubject.js";
import { subjectToKey } from "../../subjects/subjectToKey.js";
import type { CommandQueue } from "../commandQueue/types/commandQueue.js";
import type { QueuedCommand } from "../commandQueue/types/queuedCommand.js";
import type { ShardContext } from "../types/shardContext.js";
import { errorToCommandResult } from "./errorToCommandResult.js";

// A command for a subject this shard has never seen starts the import and comes
// back through the queue; an import that finds nothing answers the caller 404.
export const deferUntilResident = ({
	ctx,
	queue,
	items,
}: {
	ctx: ShardContext;
	queue: CommandQueue;
	items: QueuedCommand[];
}): void => {
	for (const item of items) {
		const { org_id: orgId, env, customer_id: customerId } = item.command;

		void ctx.subjects
			.loadOnce({
				key: subjectToKey({ orgId, env, customerId }),
				load: () => importSubject({ ctx, orgId, env, customerId }),
			})
			.then(() => queue.push(item))
			.catch((error: unknown) => {
				item.resolve(errorToCommandResult({ command: item.command, error }));
			});
	}
};
