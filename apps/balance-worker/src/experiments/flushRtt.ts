import { variant } from "@autumn/edge-config";
import type { FlushRoundTrips } from "@autumn/postgres";

/** B sends each store flush as one autocommit statement, so a pooled server connection is held for one round trip, not four. */
export const FLUSH_RTT_EXPERIMENT = "flush-rtt";

export function flushRoundTrips(): FlushRoundTrips {
	return variant(FLUSH_RTT_EXPERIMENT) === "B" ? "single" : "transaction";
}
