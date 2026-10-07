import type { ApiVersion } from "@autumn/shared";

/** Each `upTo` key covers every version up to and including it, on its own counter. */
export type VersionedRateLimit = {
	upTo: Partial<Record<ApiVersion, number>>;
	otherwise: number;
};
