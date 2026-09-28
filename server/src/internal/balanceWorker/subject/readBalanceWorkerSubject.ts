import {
	orgToCommandOrg,
	parseReadSubjectStateCommand,
} from "@autumn/balance-engine";
import { CustomerExpand, type FullSubject, type Invoice } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { requestContextToCommandBase } from "@/internal/balances/balanceWorker/requestContextToCommandBase.js";
import { readCachedCustomerInvoices } from "@/internal/invoices/actions/readCachedCustomerInvoices.js";
import { readCachedSubscriptions } from "@/internal/subscriptions/actions/readCachedSubscriptions.js";
import { workerStateToFullSubject } from "./workerStateToFullSubject.js";

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
		readCachedSubscriptions({ ctx, stripeIds: subscriptionIds }),
		readInvoices({
			ctx,
			internalCustomerId: state.customer.internal_id,
			entityId,
		}),
	]);
	return workerStateToFullSubject({ state, catalog, subscriptions, invoices });
};
