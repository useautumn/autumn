export const buildLockReceiptKey = ({
	orgId,
	env,
	lockKey,
}: {
	orgId: string;
	env: string;
	lockKey: string;
}) => {
	return `{${orgId}}:${env}:lock_receipt:${lockKey}`;
};
