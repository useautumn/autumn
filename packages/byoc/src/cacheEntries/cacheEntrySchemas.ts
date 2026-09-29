import {
	BaseApiCustomerV5Schema,
	BaseApiEntityV2Schema,
} from "@autumn/shared/publicApiSchemas";
import { z } from "zod/v4";
import { BYOC_CACHE_SCHEMA_VERSION } from "../byocConstants.js";

const CacheEntryEnvelopeSchema = z.object({
	schema_version: z.literal(BYOC_CACHE_SCHEMA_VERSION),
	api_version: z.string(),
	/** The balance-log offset the entry was computed after; a write lands only over a lower one. A string: offsets are 64-bit. */
	log_offset: z.string().regex(/^\d+$/),
	computed_at: z.number(),
});

/** A customer or entity exactly as the API renders it (no expands), or a marker that it did not fit. */
export const ByocCacheEntrySchema = z.discriminatedUnion("object", [
	CacheEntryEnvelopeSchema.extend({
		object: z.literal("customer"),
		data: BaseApiCustomerV5Schema,
	}),
	CacheEntryEnvelopeSchema.extend({
		object: z.literal("entity"),
		data: BaseApiEntityV2Schema,
	}),
	CacheEntryEnvelopeSchema.extend({ object: z.literal("oversized") }),
]);
