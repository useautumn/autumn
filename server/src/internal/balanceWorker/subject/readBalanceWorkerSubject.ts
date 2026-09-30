import {
	orgToCommandOrg,
	parseReadSubjectStateCommand,
	workerStateToFullSubject,
} from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { CustomerExpand, type FullSubject, type Invoice } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	balanceWorkerFailOpenReasonOf,
	describeBalanceWorkerFailure,
	rethrowBalanceWorkerError,
} from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { requestContextToCommandBase } from "@/internal/balances/balanceWorker/requestContextToCommandBase.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import { readCachedCustomerInvoices } from "@/internal/invoices/actions/readCachedCustomerInvoices.js";
import { readCachedSubscriptions } from "@/internal/subscriptions/actions/readCachedSubscriptions.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";

type SubjectClient = Pick<BalanceWorkerClient, "readSubjectState">;

/** Postgres holds every routed customer's rows behind the worker's log by at most its unflushed batches; the Redis view is skipped for them. */
const readSubjectFromPostgres = ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string | null;
}): Promise<FullSubject> =>
	getOrSetCachedFullSubject({
		ctx,
		customerId,
		entityId: entityId ?? undefined,
		source: "balance_worker_read_fallback",
		readFrom: "primary",
	});

/** Only an expanded customer response renders them; an entity view takes its invoices from its own expand. */
const readInvoices = async ({
	ctx,
	internalCustomerId,
	entityId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	entityId?: string | null;
}): Promise<Invoice[]> => {
	if (entityId || !ctx.expand.includes(CustomerExpand.Invoices)) return [];
	return readCachedCustomerInvoices({ ctx, internalCustomerId });
};

/**
 * A subject's full view from the worker (the customer's rows, plus the named
 * entity's own), with the ledgers it never holds read from Postgres beside it.
 * A read the worker never answered, because it was unreachable, overloaded or
 * past its deadline, is answered from Postgres instead: a read writes nothing,
 * so the fallback cannot double-apply, and the rows there trail the worker by
 * at most its unflushed batches. A verdict from the worker, a missing customer
 * above all, propagates, since Postgres would say the same.
 */
export const readBalanceWorkerSubject = async ({
	ctx,
	customerId,
	entityId,
	client = getBalanceWorkerClient(),
	readFallback = readSubjectFromPostgres,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string | null;
	client?: SubjectClient;
	readFallback?: typeof readSubjectFromPostgres;
}): Promise<FullSubject> => {
	const command = parseReadSubjectStateCommand({
		input: {
			...requestContextToCommandBase({ ctx, customerId, entityId }),
			type: "readSubjectState",
			org: orgToCommandOrg({ org: ctx.org }),
		},
	});
	let reply: Awaited<ReturnType<SubjectClient["readSubjectState"]>>;
	try {
		reply = await client
			.readSubjectState({ command })
			.catch((cause: unknown) => rethrowBalanceWorkerError({ cause }));
	} catch (error) {
		const reason = balanceWorkerFailOpenReasonOf(error);
		if (!reason) throw error;
		ctx.logger.warn(
			`[balanceWorker] ${reason}; reading the subject from Postgres`,
			{
				type: "balance_worker_fail_open",
				fail_open_reason: reason,
				fail_open_source: "read",
				worker_failure: describeBalanceWorkerFailure({ error }),
				data: { source: "read", reason },
				error,
			},
		);
		addToExtraLogs({ ctx, extras: { balanceWorkerFailOpen: "read" } });
		return readFallback({ ctx, customerId, entityId });
	}
	const { state, catalog } = reply;

	const subscriptionIds = state.customerProducts.flatMap(
		(customerProduct) => customerProduct.subscription_ids ?? [],
	);
	const [subscriptions, invoices] = await Promise.all([
		readCachedSubscriptions({ ctx, stripeIds: subscriptionIds }),
		readInvoices({
			ctx,
			internalCustomerId: state.customer.internal_id,
			entityId,
		}),
	]);
	return workerStateToFullSubject({ state, catalog, subscriptions, invoices });
};
