import {
	type InitializationDecision,
	parseInitializeCommand,
} from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { FullSubject } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "./balanceWorkerErrors.js";
import { fullSubjectToMeteringState } from "./fullSubjectToMeteringState.js";

export async function initializeBalanceWorkerCustomer({
	ctx,
	fullSubject,
	featureIds,
	initializationId,
	client,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureIds: readonly string[];
	initializationId: string;
	client?: Pick<BalanceWorkerClient, "initialize">;
}): Promise<InitializationDecision> {
	const state = fullSubjectToMeteringState({ ctx, fullSubject, featureIds });
	const command = parseInitializeCommand({
		input: {
			schemaVersion: 1,
			type: "initialize",
			initializationId,
			requestId: ctx.id,
			identity: state.identity,
			state,
			occurredAt: ctx.timestamp,
		},
	});
	try {
		return await (client ?? getBalanceWorkerClient()).initialize({ command });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
}
