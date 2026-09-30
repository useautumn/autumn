/**
 * In-memory Stripe connected-account → worker URL map served by /ingress/connect.
 * Frozen cross-task API. OWNED BY THE KEYS TASK.
 */
const routes = new Map<string, string>();

export const setIngressRoute = ({
	accountId,
	workerUrl,
}: {
	accountId: string;
	workerUrl: string;
}): void => {
	routes.set(accountId, workerUrl);
};
export const deleteIngressRoute = ({
	accountId,
}: {
	accountId: string;
}): void => {
	routes.delete(accountId);
};
export const getIngressRoute = ({
	accountId,
}: {
	accountId: string;
}): string | undefined => routes.get(accountId);
export const ingressRouteCount = (): number => routes.size;
