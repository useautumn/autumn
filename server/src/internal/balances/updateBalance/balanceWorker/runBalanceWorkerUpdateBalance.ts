import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import type { UpdateBalanceParamsV0 } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withPaidAllocatedFallback } from "@/internal/balanceWorker/subject/withPaidAllocatedFallback.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { rejectInvoiceCreditMutation } from "../../utils/validateInvoiceCreditBalanceMutation.js";
import {
	balanceNotFoundError,
	lifetimeBalanceResetError,
	paidRecurringExpiryError,
} from "../updateBalanceErrors.js";
import { updateBalanceOnCacheV2 } from "../v2/updateBalanceOnCacheV2.js";
import { updateBalanceParamsToCommand } from "./updateBalanceParamsToCommand.js";

type UpdateBalanceClient = Pick<BalanceWorkerClient, "updateBalance">;

const isRefusedFor = ({
	cause,
	reason,
}: {
	cause: unknown;
	reason: string;
}): boolean =>
	cause instanceof BalanceWorkerClientError &&
	cause.workerCode === "UNSUPPORTED_COMMAND" &&
	cause.workerReason === reason;

const rethrowUpdateBalanceError = ({
	params,
	cause,
}: {
	params: UpdateBalanceParamsV0;
	cause: unknown;
}): never => {
	if (isRefusedFor({ cause, reason: "balance_not_found" }))
		throw balanceNotFoundError({ params });
	if (isRefusedFor({ cause, reason: "invoice_credit_not_mutable" }))
		rejectInvoiceCreditMutation();
	if (isRefusedFor({ cause, reason: "lifetime_balance_has_no_reset" }))
		throw lifetimeBalanceResetError({ params });
	if (isRefusedFor({ cause, reason: "paid_recurring_balance_cannot_expire" }))
		throw paidRecurringExpiryError({ params });
	return rethrowBalanceWorkerError({ cause });
};

export const runBalanceWorkerUpdateBalance = async ({
	ctx,
	params,
	targetBalance,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParamsV0;
	targetBalance?: number;
	client?: UpdateBalanceClient;
}): Promise<void> => {
	ctx.testOptions = { ...ctx.testOptions, skipCacheDeletion: true };
	try {
		await withPaidAllocatedFallback<void>({
			ctx,
			customerId: params.customer_id,
			entityId: params.entity_id,
			worker: async () => {
				await client.updateBalance({
					command: updateBalanceParamsToCommand({ ctx, params, targetBalance }),
				});
			},
			postgres: () => updateBalanceOnCacheV2({ ctx, params, targetBalance }),
		});
	} catch (cause) {
		rethrowUpdateBalanceError({ params, cause });
	}
};
