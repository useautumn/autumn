import { autoTopupJob } from "./autoTopup.js";
import {
	customerCreationRecoveryJob,
	entityCreationRecoveryJob,
} from "./creationRecovery.js";

export const jobCatalogue = {
	autoTopup: autoTopupJob,
	customerCreationRecovery: customerCreationRecoveryJob,
	entityCreationRecovery: entityCreationRecoveryJob,
} as const;

export type JobCatalogue = typeof jobCatalogue;
