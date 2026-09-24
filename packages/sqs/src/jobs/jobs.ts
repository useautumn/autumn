import { autoTopupJob } from "./autoTopup.js";

/** The catalogue: every job Autumn queues. A new job is one file beside these and one line here. */
export const jobCatalogue = {
	autoTopup: autoTopupJob,
} as const;

export type JobCatalogue = typeof jobCatalogue;
