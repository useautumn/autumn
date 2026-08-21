export const buildRuntimeSubjectKey = ({
	orgId,
	env,
	customerId,
	entityId,
}: {
	orgId: string;
	env: string;
	customerId: string;
	entityId?: string;
}): string =>
	entityId
		? `{${customerId}}:${orgId}:${env}:entity:${entityId}:runtime_subject`
		: `{${customerId}}:${orgId}:${env}:runtime_subject`;
