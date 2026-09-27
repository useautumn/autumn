import {
	orgToCommandOrg,
	type RecalculateBalanceCommand,
	type RecalculateBalanceResult,
} from "@autumn/balance-engine";
import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import type {
	RecalculateBalanceParamsV0,
	RecalculateBalancePreview,
} from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { featureToInternalFeatureId } from "../../balanceWorker/featureToInternalFeatureId.js";
import { requestContextToCommandBase } from "../../balanceWorker/requestContextToCommandBase.js";
import { balanceRowsNotFoundError } from "../../utils/balanceRowsNotFoundError.js";
import { buildCustomerEntitlementFilters } from "../../utils/buildCustomerEntitlementFilters.js";
import { rejectInvoiceCreditMutation } from "../../utils/validateInvoiceCreditBalanceMutation.js";

type RecalculateClient = Pick<BalanceWorkerClient, "recalculateBalance">;

const recalculateParamsToCommand = ({
	ctx,
	params,
	preview,
}: {
	ctx: AutumnContext;
	params: RecalculateBalanceParamsV0;
	preview: boolean;
}): RecalculateBalanceCommand => ({
	...requestContextToCommandBase({
		ctx,
		customerId: params.customer_id,
		entityId: params.entity_id ?? null,
	}),
	type: "recalculateBalance",
	org: orgToCommandOrg({ org: ctx.org }),
	commandId: ctx.id,
	featureId: params.feature_id,
	internalFeatureId: featureToInternalFeatureId({
		ctx,
		featureId: params.feature_id,
	}),
	customerEntitlementFilters: buildCustomerEntitlementFilters({ params }),
	preview,
});

/** The worker's refusals as legacy words them. */
const rethrowRecalculateError = ({
	params,
	cause,
}: {
	params: RecalculateBalanceParamsV0;
	cause: unknown;
}): never => {
	const reason =
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "UNSUPPORTED_COMMAND"
			? cause.workerReason
			: undefined;
	if (reason === "balance_not_found")
		throw balanceRowsNotFoundError({
			customerId: params.customer_id,
			featureId: params.feature_id,
		});
	if (reason === "invoice_credit_not_mutable") rejectInvoiceCreditMutation();
	return rethrowBalanceWorkerError({ cause });
};

/** Recalculates on the worker, or previews it there without writing. */
export const runBalanceWorkerRecalculateBalance = async ({
	ctx,
	params,
	preview,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	params: RecalculateBalanceParamsV0;
	preview: boolean;
	client?: RecalculateClient;
}): Promise<RecalculateBalanceResult> => {
	// The worker holds the write; the route's refresh would only evict its fresh copy.
	if (!preview)
		ctx.testOptions = { ...ctx.testOptions, skipCacheDeletion: true };
	try {
		const { result } = await client.recalculateBalance({
			command: recalculateParamsToCommand({ ctx, params, preview }),
		});
		return result;
	} catch (cause) {
		return rethrowRecalculateError({ params, cause });
	}
};

/** The preview endpoint's shape. */
export const recalculateResultToPreview = ({
	result,
}: {
	result: RecalculateBalanceResult;
}): RecalculateBalancePreview => ({
	total_usage: result.totalUsage,
	entitlements: result.customerEntitlements.map(
		({ customerEntitlementId, beforeRemaining, afterRemaining }) => ({
			customer_entitlement_id: customerEntitlementId,
			before_remaining: beforeRemaining,
			after_remaining: afterRemaining,
		}),
	),
});
