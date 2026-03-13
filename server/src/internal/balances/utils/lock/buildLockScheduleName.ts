export const buildLockScheduleName = ({
	orgId,
	env,
	hashedKey,
}: {
	orgId: string;
	env: string;
	hashedKey: string;
}) => `lock-${Bun.hash(`${orgId}:${env}:${hashedKey}`).toString()}`;
