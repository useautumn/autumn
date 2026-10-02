import { autoTopupJob } from "./autoTopup.js";
import {
	customerCreationRecoveryJob,
	entityCreationRecoveryJob,
} from "./creationRecovery.js";

/** The catalogue: every job Autumn queues. A new job is one file beside these and one line here. */
export const jobCatalogue = {
	autoTopup: autoTopupJob,
	customerCreationRecovery: customerCreationRecoveryJob,
	entityCreationRecovery: entityCreationRecoveryJob,
} as const;

export type JobCatalogue = typeof jobCatalogue;
