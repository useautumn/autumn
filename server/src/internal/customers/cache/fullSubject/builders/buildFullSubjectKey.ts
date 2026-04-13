export const buildFullSubjectKey = ({
	orgId,
	env,
	customerId,
	entityId,
}: {
	orgId: string;
	env: string;
	customerId: string;
	entityId?: string;
}) =>
	entityId
		? `{${customerId}}:${orgId}:${env}:entity:${entityId}:full_subject`
		: `{${customerId}}:${orgId}:${env}:full_subject`;
