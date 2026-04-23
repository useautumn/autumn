import type { AppEnv } from "@autumn/shared";

export const buildFullSubjectOrgEnvKey = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => `${orgId}:${env}`;
