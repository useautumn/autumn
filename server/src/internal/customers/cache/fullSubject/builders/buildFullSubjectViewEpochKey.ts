export const buildFullSubjectViewEpochKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => `{${customerId}}:${orgId}:${env}:full_subject:view_epoch`;
