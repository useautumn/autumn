import type { Catalog, CommandOrg, SubjectState } from "@autumn/balance-engine";
import { z } from "zod/v4";
import type { StoredSubject } from "../../state/types/storedSubject.js";

// Autumn built these rows, so Atom confirms only the fields it reads itself and stores the rest as sent:
// a field a newer Autumn adds must never make an older Atom refuse the subject.
const stateShape = z.looseObject({
	identity: z.looseObject({
		orgId: z.string().min(1),
		env: z.string().min(1),
		customerId: z.string().min(1),
	}),
});
const catalogShape = z.looseObject({
	features: z.record(z.string(), z.unknown()),
});
const orgShape = z.looseObject({ config: z.record(z.string(), z.unknown()) });

/** Passes the value through untouched, typed as what Autumn sends, once its shape holds. */
const sentAs = <Sent>(shape: z.ZodType) =>
	z.custom<Sent>((value) => shape.safeParse(value).success);

/** `POST /v1/subjects.set` as Autumn sends it. */
const subjectBodySchema = z.object({
	state: sentAs<SubjectState>(stateShape),
	catalog: sentAs<Catalog>(catalogShape),
	org: sentAs<CommandOrg>(orgShape),
	/** A string: log offsets are 64-bit. */
	log_offset: z.string().regex(/^\d+$/),
});

export const subjectBodyToStoredSubject = ({
	body,
}: {
	body: unknown;
}): StoredSubject => {
	const parsed = subjectBodySchema.parse(body);
	return {
		state: parsed.state,
		catalog: parsed.catalog,
		org: parsed.org,
		logOffset: BigInt(parsed.log_offset),
	};
};
