import { z } from "zod/v4";

/** Where an Atom pulls a subject it does not hold, proving itself by its token hash as `keys.check` does. */
export const ATOM_SUBJECT_READ_PATH = "/atom/subjects.read";

export const AtomSubjectReadRequestSchema = z.object({
	customer_id: z.string().min(1),
	entity_id: z.string().min(1).nullable(),
});

/** 200 is the `subjects.set` body itself, as text; 400 is an unreadable request. */
export const AtomSubjectReadErrorCode = {
	/** 401: no Atom holds the token hash. */
	AtomUnknown: "atom_unknown",
	/** 404: the customer or entity does not exist. */
	SubjectNotFound: "subject_not_found",
	/** 409: the customer is off the balance worker, or this Atom is not one herald pushes it to. */
	SubjectNotHeld: "subject_not_held",
	/** 503: the worker failed, or answered without a read offset. */
	WorkerUnavailable: "worker_unavailable",
} as const;

export type AtomSubjectReadErrorCode =
	(typeof AtomSubjectReadErrorCode)[keyof typeof AtomSubjectReadErrorCode];
