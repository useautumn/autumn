export type CjsChildrenDedupe = {
	start(): void;
	stop(): void;
	/** Modules the last sweep saw; null before the first, or when disabled. */
	cachedModules(): number | null;
};
