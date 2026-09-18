import { parseInitializeRequest } from "@autumn/balance-engine";
import type {
	BalanceWorkerClient,
	InitializeReply,
} from "@autumn/balance-worker-client";
import type { FullSubject } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "./balanceWorkerErrors.js";
import {
	fullSubjectToCatalogRows,
	fullSubjectToSubjectState,
} from "./fullSubjectToSubjectState.js";
import { requestContextToCommandBase } from "./requestContextToCommandBase.js";

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
}): Promise<InitializeReply> {
	const state = fullSubjectToSubjectState({ ctx, fullSubject, featureIds });
	const request = parseInitializeRequest({
		input: {
			command: {
				...requestContextToCommandBase({
					ctx,
					customerId: state.identity.customerId,
					entityId: state.identity.entityId,
				}),
				type: "initialize",
				commandId,
			},
			state,
			catalogRows: fullSubjectToCatalogRows({ ctx, fullSubject, featureIds }),
		},
	});
	try {
		return await (client ?? getBalanceWorkerClient()).initialize({ request });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
}
