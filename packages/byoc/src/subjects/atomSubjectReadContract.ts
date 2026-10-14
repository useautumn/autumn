import { z } from "zod/v4";

export const ATOM_SUBJECT_READ_PATH = "/atom/subjects.read";

export const AtomSubjectReadRequestSchema = z.object({
	customer_id: z.string().min(1),
	entity_id: z.string().min(1).nullable(),
});

export const AtomSubjectReadErrorCode = {
	AtomUnknown: "atom_unknown",
	SubjectNotFound: "subject_not_found",
	SubjectNotHeld: "subject_not_held",
	WorkerUnavailable: "worker_unavailable",
} as const;

export type AtomSubjectReadErrorCode =
	(typeof AtomSubjectReadErrorCode)[keyof typeof AtomSubjectReadErrorCode];
