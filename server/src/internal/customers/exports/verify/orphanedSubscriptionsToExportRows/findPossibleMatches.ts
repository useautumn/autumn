import { notNullish } from "@autumn/shared";
import { dbReplica } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCustomerIdsByEmail } from "../../queries/getBillingVerifyCandidates.js";
import { retryExportDbRead } from "../retryExportDbRead.js";
import type { OrphanedStripeCustomer } from "./orphanToExportRow.js";
import { toLookupBatches } from "./toLookupBatches.js";

/** An Autumn customer sharing the orphan's email is usually the one whose
 * Stripe link was lost, so it is surfaced as the customer to relink. */
export const findPossibleMatches = async ({
	ctx,
	orphans,
}: {
	ctx: AutumnContext;
	orphans: OrphanedStripeCustomer[];
}): Promise<Map<string, string[]>> => {
	const emails = [
		...new Set(orphans.map((orphan) => orphan.email).filter(notNullish)),
	];
	const readCustomerIdsByEmail = retryExportDbRead({
		logger: ctx.logger,
		operation: "getCustomerIdsByEmail",
		query: getCustomerIdsByEmail,
	});

	const customerIdsByEmail = new Map<string, string[]>();
	for (const batch of toLookupBatches(emails)) {
		const found = await readCustomerIdsByEmail({
			db: dbReplica ?? ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			emails: batch,
		});
		for (const [email, customerIds] of found)
			customerIdsByEmail.set(email, customerIds);
	}
	return customerIdsByEmail;
};
