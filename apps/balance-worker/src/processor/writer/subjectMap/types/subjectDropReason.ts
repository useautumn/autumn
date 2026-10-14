export type SubjectEvictReason = "evict" | "stale" | "storeRejected";

export type SubjectDropReason =
	| SubjectEvictReason
	| "capacity"
	| "idle"
	| "coldStart";
