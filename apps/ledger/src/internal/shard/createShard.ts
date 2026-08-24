import type { Command } from "../../api/types/command.js";
import type { CommandResult } from "../../api/types/commandResult.js";
import { createCommandQueue } from "./commandQueue/createCommandQueue.js";
import { runCommand } from "./runCommand.js";
import type { Shard } from "./types/shard.js";
import type { ShardContext } from "./types/shardContext.js";
import { runWriterLoop } from "./writerLoop/runWriterLoop.js";

export const createShard = ({ ctx }: { ctx: ShardContext }): Shard => {
	const queue = createCommandQueue();
	const loop = runWriterLoop({ ctx, queue, runCommand });

	const run = (command: Command) =>
		new Promise<CommandResult>((resolve) => {
			queue.push({ command, resolve });
		});

	const stop = async () => {
		queue.close();
		await loop;
	};

	return { id: ctx.shardId, run, stop };
};
