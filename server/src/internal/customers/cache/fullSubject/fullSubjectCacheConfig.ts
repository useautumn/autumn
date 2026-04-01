import { seconds } from "@autumn/shared";

/** Cache TTL in seconds (3 days) */
export const FULL_SUBJECT_CACHE_TTL_SECONDS = seconds.days(3);

/** Guard TTL in seconds — prevents stale writes after deletion */
export const FULL_SUBJECT_CACHE_GUARD_TTL_SECONDS = 1;

export const buildFullSubjectCacheKey = ({
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
		? `{${orgId}}:${env}:fullentity:1.0.0:${customerId}:${entityId}`
		: `{${orgId}}:${env}:fullcustomer:2.0.0:${customerId}`;

export const buildFullSubjectGuardKey = ({
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
		? `{${orgId}}:${env}:fullentity:guard:${customerId}:${entityId}`
		: `{${orgId}}:${env}:fullcustomer:guard:v2:${customerId}`;
