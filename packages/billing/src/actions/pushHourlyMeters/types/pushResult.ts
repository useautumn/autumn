export type PushResult = {
	pushed: number;
	failed: number;
	/** One message per failed chunk, for the run report. */
	errors: string[];
};
