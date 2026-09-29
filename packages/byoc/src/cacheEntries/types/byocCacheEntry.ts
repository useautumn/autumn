import type { z } from "zod/v4";
import type { ByocCacheEntrySchema } from "../cacheEntrySchemas.js";

export type ByocCacheEntry = z.infer<typeof ByocCacheEntrySchema>;
