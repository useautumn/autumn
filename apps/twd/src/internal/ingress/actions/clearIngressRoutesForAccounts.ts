import { deleteIngressRoute } from "./ingressRoutes.ts";

/** Drop the worker routes of accounts a run released; late events then get the unknown-account 200 ack. */
export const clearIngressRoutesForAccounts = ({
	accountIds,
}: {
	accountIds: string[];
}): void => {
	for (const accountId of accountIds) deleteIngressRoute({ accountId });
};
