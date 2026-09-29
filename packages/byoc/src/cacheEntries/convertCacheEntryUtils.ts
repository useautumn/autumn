import type {
	BaseApiCustomerV5,
	BaseApiEntityV2,
} from "@autumn/shared/publicApiSchemas";
import {
	BYOC_CACHE_API_VERSION,
	BYOC_CACHE_MAX_ENTRY_BYTES,
	BYOC_CACHE_SCHEMA_VERSION,
} from "../byocConstants.js";
import { customerByocCacheKey, entityByocCacheKey } from "./cacheKeys.js";
import type { ByocCacheEntry } from "./types/byocCacheEntry.js";

type CacheEntryStamp = {
	/** A customer's records all land on one partition, so its offsets only rise. */
	logOffset: bigint;
	computedAt: number;
};

const cacheEntryEnvelope = ({ logOffset, computedAt }: CacheEntryStamp) =>
	({
		schema_version: BYOC_CACHE_SCHEMA_VERSION,
		api_version: BYOC_CACHE_API_VERSION,
		log_offset: logOffset.toString(),
		computed_at: computedAt,
	}) as const;

/** Too big for the KV, an entry becomes a marker readers skip for the API. */
const fitCacheEntry = ({
	entry,
}: {
	entry: ByocCacheEntry;
}): ByocCacheEntry => {
	const bytes = new TextEncoder().encode(JSON.stringify(entry)).byteLength;
	if (bytes <= BYOC_CACHE_MAX_ENTRY_BYTES) return entry;
	const { schema_version, api_version, log_offset, computed_at } = entry;
	return {
		schema_version,
		api_version,
		log_offset,
		computed_at,
		object: "oversized",
	};
};

/** A customer as customers.get renders it; the id comes from the caller since the API allows a null one. */
export const customerToCacheEntry = ({
	customerId,
	customer,
	...stamp
}: CacheEntryStamp & {
	customerId: string;
	customer: BaseApiCustomerV5;
}): { key: string; entry: ByocCacheEntry } => ({
	key: customerByocCacheKey({ customerId }),
	entry: fitCacheEntry({
		entry: { ...cacheEntryEnvelope(stamp), object: "customer", data: customer },
	}),
});

/** An entity as entities.get renders it, keyed under its customer. */
export const entityToCacheEntry = ({
	customerId,
	entityId,
	entity,
	...stamp
}: CacheEntryStamp & {
	customerId: string;
	entityId: string;
	entity: BaseApiEntityV2;
}): { key: string; entry: ByocCacheEntry } => ({
	key: entityByocCacheKey({ customerId, entityId }),
	entry: fitCacheEntry({
		entry: { ...cacheEntryEnvelope(stamp), object: "entity", data: entity },
	}),
});
