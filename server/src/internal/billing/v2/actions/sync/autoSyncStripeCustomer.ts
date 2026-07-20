import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { canAutoSync } from "./canAutoSync";
import { prepareAutoSyncStripeCustomer } from "./setup/prepareAutoSyncStripeCustomer";
import { syncV2 } from "./syncV2";
import { withStripeSyncCustomerLock } from "./utils/withStripeSyncCustomerLock";

const autoSyncStripeCustomer = async ({
	ctx,
	customerId,
	stripeCustomerId,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeCustomerId: string;
}) => {
	const drafts = await prepareAutoSyncStripeCustomer({
		ctx,
		customerId,
		stripeCustomerId,
	});
	for (const draft of drafts) {
		if (!draft) continue;
		const { match, params } = draft;
		if (!canAutoSync({ match }).eligible) continue;
		await syncV2({
			ctx,
			params,
			tags: ["sync:customer.create"],
		});
	}
};

export const autoSyncStripeCustomerWithLock = (params: {
	ctx: AutumnContext;
	customerId: string;
	stripeCustomerId: string;
}) => {
	const { ctx, customerId } = params;
	return withStripeSyncCustomerLock({
		ctx,
		customerId,
		run: () => autoSyncStripeCustomer(params),
	});
};
