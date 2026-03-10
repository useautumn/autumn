export const buildBillingLockKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => {
	return `lock:attach:${orgId}:${env}:${customerId}`;
};
