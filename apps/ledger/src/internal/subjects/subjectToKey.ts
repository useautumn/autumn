import type { AppEnv } from "@autumn/shared";

// One subject per (org, env, customer) — the unit a shard imports and owns.
export const subjectToKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: AppEnv;
	customerId: string;
}): string => `${orgId}:${env}:${customerId}`;
