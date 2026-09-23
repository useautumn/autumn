import {
	orgToCommandOrg,
	parseReadSubjectStateCommand,
} from "@autumn/balance-engine";
import {
	CustomerExpand,
	type FullSubject,
	type Invoice,
	type Subscription,
} from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { requestContextToCommandBase } from "@/internal/balances/balanceWorker/requestContextToCommandBase.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { workerStateToFullSubject } from "./workerStateToFullSubject.js";

/** The same ten the Postgres read carries; only an expanded response renders them. */
const INVOICE_LIMIT = 10;

const readSubscriptions = async ({
	ctx,
	subscriptionIds,
}: {
	ctx: AutumnContext;
	subscriptionIds: string[];
}): Promise<Subscription[]> => {
	if (subscriptionIds.length === 0) return [];
	return SubService.getInStripeIds({ db: ctx.db, ids: subscriptionIds });
};

const readInvoices = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
}): Promise<Invoice[]> => {
	if (!ctx.expand.includes(CustomerExpand.Invoices)) return [];
	return InvoiceService.list({
		db: ctx.db,
		internalCustomerId,
		limit: INVOICE_LIMIT,
	});
};

/** A subject's full view from the worker (the customer's rows, plus the named entity's own), with the ledgers it never holds read from Postgres beside it. */
export const readBalanceWorkerSubject = async ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string | null;
}): Promise<FullSubject> => {
	const command = parseReadSubjectStateCommand({
		input: {
			...requestContextToCommandBase({ ctx, customerId, entityId }),
			type: "readSubjectState",
			org: orgToCommandOrg({ org: ctx.org }),
		},
	});
	const { state, catalog } = await getBalanceWorkerClient()
		.readSubjectState({ command })
		.catch((cause: unknown) => rethrowBalanceWorkerError({ cause }));

	const subscriptionIds = state.customerProducts.flatMap(
		(customerProduct) => customerProduct.subscription_ids ?? [],
	);
	const [subscriptions, invoices] = await Promise.all([
		readSubscriptions({ ctx, subscriptionIds }),
		readInvoices({ ctx, internalCustomerId: state.customer.internal_id }),
	]);
	return workerStateToFullSubject({ state, catalog, subscriptions, invoices });
};
