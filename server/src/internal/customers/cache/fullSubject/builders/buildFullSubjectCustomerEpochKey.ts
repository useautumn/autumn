export const buildFullSubjectCustomerEpochKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => `{${customerId}}:${orgId}:${env}:full_subject:customer_entity_epoch`;
