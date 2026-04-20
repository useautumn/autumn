export const buildSharedFullSubjectBalanceKey = ({
	orgId,
	env,
	customerId,
	featureId,
}: {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
}) =>
	`{${customerId}}:${orgId}:${env}:full_subject:shared_balances:${featureId}`;
