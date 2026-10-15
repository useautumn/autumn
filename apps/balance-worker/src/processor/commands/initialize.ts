import {
	type InitializeRequest,
	meteringIdentityToPartitionKey,
	parseInitializeRequest,
} from "@autumn/balance-engine";
import type { InitializeReply } from "@autumn/balance-worker-client/protocol";
import { initializeSubject } from "../actions/initializeSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

export class MigrationFencedInitializeError extends Error {
	constructor({ customerKey }: { customerKey: string }) {
		super(
			`Customer ${customerKey} is being migrated; its rows are reloaded once the write settles`,
		);
		this.name = "MigrationFencedInitializeError";
	}
}

/** The server hands over a customer's rows; the worker makes them the baseline unless it already has one. */
export async function initialize({
	scope,
	request,
}: {
	scope: PartitionProcessorScope;
	request: InitializeRequest;
}): Promise<InitializeReply> {
	const parsed = parseInitializeRequest({ input: request });
	const customerKey = meteringIdentityToPartitionKey({
		identity: parsed.command.identity,
	});
	if (scope.ctx.writer.waitForFence({ customerKey }))
		throw new MigrationFencedInitializeError({ customerKey });
	return await initializeSubject({ ctx: scope.ctx, request: parsed });
}
