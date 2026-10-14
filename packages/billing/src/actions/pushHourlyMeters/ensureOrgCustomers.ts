import type { AutumnClient } from "../../types/autumnClient";
import { runAtRate } from "../../utils/runAtRate";
import type { OrgCustomer } from "./types/orgCustomer";

export const ENSURE_CUSTOMERS_PER_SECOND = 20;

export const ensureOrgCustomers = async ({
	ctx,
	orgs,
}: {
	ctx: { autumn: Pick<AutumnClient, "getOrCreateCustomer"> };
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
