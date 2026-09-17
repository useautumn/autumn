import {
	type InitializationDecision,
	parseInitializeCommand,
} from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { FullSubject } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "./balanceWorkerErrors.js";
import {
	fullSubjectToCatalogRows,
	fullSubjectToCustomerState,
} from "./fullSubjectToCustomerState.js";

export async function initializeBalanceWorkerCustomer({
	ctx,
	fullSubject,
	featureIds,
	commandId,
	client,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureIds: readonly string[];
	commandId: string;
	client?: Pick<BalanceWorkerClient, "initialize">;
}): Promise<InitializationDecision> {
	const state = fullSubjectToCustomerState({ ctx, fullSubject, featureIds });
	const command = parseInitializeCommand({
		input: {
			schemaVersion: 1,
			type: "initialize",
			commandId,
			requestId: ctx.id,
			identity: state.identity,
			state,
			catalogRows: fullSubjectToCatalogRows({ ctx, fullSubject, featureIds }),
			occurredAt: ctx.timestamp,
		},
	});
	try {
		return await (client ?? getBalanceWorkerClient()).initialize({ command });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
}
