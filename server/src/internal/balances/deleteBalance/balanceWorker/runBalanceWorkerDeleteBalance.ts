import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import type { DeleteBalanceParamsV0 } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { balanceRowsNotFoundError } from "../../utils/balanceRowsNotFoundError.js";
import { rejectInvoiceCreditMutation } from "../../utils/validateInvoiceCreditBalanceMutation.js";
import {
	paidBalanceNotDeletableError,
	pooledBalanceNotDeletableError,
} from "../deleteBalanceErrors.js";
import { deleteBalanceParamsToCommand } from "./deleteBalanceParamsToCommand.js";

type DeleteBalanceClient = Pick<BalanceWorkerClient, "deleteBalance">;

const refusalReasonOf = (cause: unknown): string | undefined =>
	cause instanceof BalanceWorkerClientError &&
	cause.workerCode === "UNSUPPORTED_COMMAND"
		? cause.workerReason
		: undefined;

/** The worker's refusals as legacy words them. */
const rethrowDeleteBalanceError = ({
	params,
	cause,
}: {
	params: DeleteBalanceParamsV0;
	cause: unknown;
}): never => {
	switch (refusalReasonOf(cause)) {
		case "balance_not_found":
			throw balanceRowsNotFoundError({
				customerId: params.customer_id,
				featureId: params.feature_id,
			});
		case "paid_balance_not_deletable":
			throw paidBalanceNotDeletableError({ params });
		case "pooled_balance_not_deletable":
			throw pooledBalanceNotDeletableError({ params });
		case "invoice_credit_not_mutable":
			return rejectInvoiceCreditMutation();
		default:
			return rethrowBalanceWorkerError({ cause });
	}
};

export const runBalanceWorkerDeleteBalance = async ({
	ctx,
	params,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	params: DeleteBalanceParamsV0;
	client?: DeleteBalanceClient;
}): Promise<void> => {
	// The worker holds the write; the route's refresh would only evict its fresh copy.
	ctx.testOptions = { ...ctx.testOptions, skipCacheDeletion: true };
	try {
		await client.deleteBalance({
			command: deleteBalanceParamsToCommand({ ctx, params }),
		});
	} catch (cause) {
		rethrowDeleteBalanceError({ params, cause });
	}
};
