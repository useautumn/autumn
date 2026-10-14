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
		runLazyResets: false,
	});

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
