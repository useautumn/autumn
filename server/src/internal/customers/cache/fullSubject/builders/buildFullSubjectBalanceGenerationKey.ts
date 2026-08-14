type FullSubjectBalanceGenerationKeyArgs = {
	orgId: string;
	env: string;
	customerId: string;
};

export const buildFullSubjectBalanceGenerationKey = ({
	orgId,
	env,
	customerId,
}: FullSubjectBalanceGenerationKeyArgs) =>
	`{${customerId}}:${orgId}:${env}:full_subject:balance_generation`;

/** Serializes attach publication against sync-conflict cache invalidation. */
export const buildFullSubjectBalanceHandoffLockKey = (
	args: FullSubjectBalanceGenerationKeyArgs,
) => `${buildFullSubjectBalanceGenerationKey(args)}:handoff_lock`;
