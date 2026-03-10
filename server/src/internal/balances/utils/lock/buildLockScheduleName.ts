/** Builds a tenant-scoped EventBridge schedule name for a lock receipt expiry. */
export const buildLockScheduleName = ({
	orgId,
	env,
	hashedKey,
}: {
	orgId: string;
	env: string;
	hashedKey: string;
}) => `lock-${orgId}-${env}-${hashedKey}`;
