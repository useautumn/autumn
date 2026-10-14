import {
	type InitializeRequest,
	parseInitializeRequest,
} from "@autumn/balance-engine";
import type { InitializeReply } from "@autumn/balance-worker-client/protocol";
import { initializeSubject } from "../actions/initializeSubject.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

export async function initialize({
	scope,
	request,
}: {
	scope: PartitionProcessorScope;
	request: InitializeRequest;
}): Promise<InitializeReply> {
	const parsed = parseInitializeRequest({ input: request });
	return await initializeSubject({ ctx: scope.ctx, request: parsed });
}
