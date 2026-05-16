/**
 * Public IDs that map 1:1 to internal IDs are translated at parse time,
 * before the IR is built. This keeps the compiler pure — it only ever
 * sees resolved internal IDs for those fields.
 *
 * Currently only `feature_id` is translated (features are not versioned,
 * so the mapping is 1:1). `plan_id` is NOT translated — a public plan_id
 * maps to many internal_product_ids (one per version), so we resolve it
 * via a JOIN to `products` instead.
 *
 * Unknown IDs throw at parse time, never silently miss.
 */

export type ResolutionContext = {
	features: ReadonlyArray<{ id: string; internal_id: string }>;
};
