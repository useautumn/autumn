import type { AutumnClient } from "../../types/autumnClient";
import { runAtRate } from "../../utils/runAtRate";
import type { OrgCustomer } from "./types/orgCustomer";

/** get_or_create is idempotent and cheap, but 20/s keeps our own API comfortable. */
export const ENSURE_CUSTOMERS_PER_SECOND = 20;

/** Every org that has usage this run exists as a customer, named by its slug. */
export const ensureOrgCustomers = async ({
	ctx,
	orgs,
}: {
	ctx: { autumn: AutumnClient };
	orgs: OrgCustomer[];
}): Promise<void> => {
	const uniqueOrgs = [...new Map(orgs.map((org) => [org.id, org])).values()];
	await runAtRate({
		items: uniqueOrgs,
		perSecond: ENSURE_CUSTOMERS_PER_SECOND,
		run: (org) =>
			ctx.autumn.getOrCreateCustomer({ id: org.id, name: org.name }),
	});
};
