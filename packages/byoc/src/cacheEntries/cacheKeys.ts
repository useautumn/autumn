import { BYOC_CACHE_SCHEMA_VERSION } from "../byocConstants.js";

/** `.` separates parts because Autumn ids never contain one (they may contain `:`). */
const KEY_PREFIX = `v${BYOC_CACHE_SCHEMA_VERSION}`;

export const customerByocCacheKey = ({ customerId }: { customerId: string }) =>
	`${KEY_PREFIX}.customer.${customerId}`;

export const entityByocCacheKey = ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId: string;
}) => `${KEY_PREFIX}.entity.${customerId}.${entityId}`;
