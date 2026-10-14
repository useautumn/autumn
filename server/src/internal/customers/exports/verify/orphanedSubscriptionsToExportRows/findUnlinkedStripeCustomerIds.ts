import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getLinkedStripeCustomerIds } from "../../queries/getBillingVerifyCandidates.js";
import { billingVerifyExportConfig } from "../billingVerifyExportConfig.js";
import { retryExportDbRead } from "../retryExportDbRead.js";
import { toBatches } from "./toBatches.js";

export const findUnlinkedStripeCustomerIds = async ({
	ctx,
	db,
	stripeCustomerIds,
}: {
	ctx: AutumnContext;
	db: DrizzleCli;
	stripeCustomerIds: string[];
}): Promise<string[]> => {
	const readLinkedStripeCustomerIds = retryExportDbRead({
		logger: ctx.logger,
		operation: "getLinkedStripeCustomerIds",
		query: getLinkedStripeCustomerIds,
	});

	const unlinked: string[] = [];
	for (const batch of toBatches({
		items: stripeCustomerIds,
		size: billingVerifyExportConfig.orphans.lookupBatchSize,
	})) {
		const linked = await readLinkedStripeCustomerIds({
			db,
			orgId: ctx.org.id,
			env: ctx.env,
			stripeCustomerIds: batch,
		});
		unlinked.push(...batch.filter((id) => !linked.has(id)));
	}
	return unlinked;
};
