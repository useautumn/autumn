import type { ChainableCommander, Command, Pipeline, Redis } from "ioredis";

export const createRedisPipeline = ({
	redis,
	commandTimeoutMs,
}: {
	redis: Redis;
	commandTimeoutMs?: number;
}): ChainableCommander => {
	const pipeline = redis.pipeline() as Pipeline;
	if (commandTimeoutMs === undefined) return pipeline;

	const commands: Command[] = [];
	const sendCommand = pipeline.sendCommand.bind(pipeline);
	const exec = pipeline.exec.bind(pipeline);

	pipeline.sendCommand = (command) => {
		commands.push(command);
		return sendCommand(command);
	};
	pipeline.exec = (callback) => {
		// ioredis preserves an already-armed command timer instead of using its client default.
		// Arm only at exec(), so time spent building the pipeline doesn't consume the budget.
		for (const command of commands) command.setTimeout(commandTimeoutMs);
		return exec(callback);
	};
	return pipeline;
};
