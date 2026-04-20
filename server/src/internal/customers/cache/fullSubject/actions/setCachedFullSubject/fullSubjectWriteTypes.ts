export type SetCachedFullSubjectResult =
	| "OK"
	| "STALE_WRITE"
	| "CACHE_EXISTS"
	| "FAILED";
