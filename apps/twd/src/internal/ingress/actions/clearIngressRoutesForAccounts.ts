import { deleteIngressRoute } from "./ingressRoutes.ts";

export const clearIngressRoutesForAccounts = ({
	accountIds,
}: {
	accountIds: string[];
}): void => {
	for (const accountId of accountIds) deleteIngressRoute({ accountId });
};
