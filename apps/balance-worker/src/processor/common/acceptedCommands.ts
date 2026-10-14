import type { AcceptedCommands } from "../types/partitionProcessor.js";

export function createAcceptedCommands(): AcceptedCommands {
	return { active: new Set() };
}

export function acceptCommand<Result>({
	accepted,
	operation,
}: {
	accepted: AcceptedCommands;
	operation: Promise<Result>;
}): Promise<Result> {
	accepted.active.add(operation);
	void forgetWhenSettled({ accepted, operation });
	return operation;
}

export async function settleAcceptedCommands({
	accepted,
}: {
	accepted: AcceptedCommands;
}): Promise<void> {
	await Promise.allSettled([...accepted.active]);
}

async function forgetWhenSettled({
	accepted,
	operation,
}: {
	accepted: AcceptedCommands;
	operation: Promise<unknown>;
}): Promise<void> {
	try {
		await operation;
	} catch {
	} finally {
		accepted.active.delete(operation);
	}
}
