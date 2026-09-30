import {
	type MeteringIdentity,
	orgToCommandOrg,
	parseReadSubjectStateCommand,
	workerStateToFullSubject,
} from "@autumn/balance-engine";
import type { FullSubject, Organization } from "@autumn/shared";
import { readCachedSubscriptions } from "../../../subscriptions/readCachedSubscriptions.js";
import type { CachePushContext } from "../types/cachePushContext.js";

/** The subject as its worker holds it now, at or past the record that moved it, with its subscription rows beside it. */
export const readFullSubject = async ({
	ctx,
	identity,
	org,
}: {
	ctx: CachePushContext;
	identity: MeteringIdentity;
	org: Organization;
}): Promise<FullSubject> => {
	const command = parseReadSubjectStateCommand({
		input: {
			schemaVersion: 1,
			requestId: `herald_cache_push_${crypto.randomUUID()}`,
			identity,
			occurredAt: Date.now(),
			type: "readSubjectState",
			org: orgToCommandOrg({ org }),
		},
	});
	const { state, catalog } = await ctx.balanceWorkerClient.readSubjectState({
		command,
	});
	const subscriptions = await readCachedSubscriptions({
		ctx,
		stripeIds: state.customerProducts.flatMap(
			(customerProduct) => customerProduct.subscription_ids ?? [],
		),
	});
	return workerStateToFullSubject({
		state,
		catalog,
		subscriptions,
		invoices: [],
	});
};
