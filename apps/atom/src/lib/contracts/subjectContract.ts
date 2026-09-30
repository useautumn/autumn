import type { Catalog, SubjectState } from "@autumn/balance-engine";
import type { SharedContext } from "@autumn/shared";
import { z } from "zod/v4";
import type { StoredSubject } from "../../state/types/storedSubject.js";
import { sentAs } from "./sentAs.js";

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

/** `POST /v1/subjects.set` as Autumn sends it. */
const subjectBodySchema = z.object({
	state: sentAs<SubjectState>(stateShape),
	catalog: sentAs<Catalog>(catalogShape),
	org: sentAs<SharedContext["org"]>(orgShape),
	/** A string: log offsets are 64-bit. */
	log_offset: z.string().regex(/^\d+$/),
	/** Epoch ms. */
	read_at: z.number().int().nonnegative(),
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
		readAt: parsed.read_at,
	};
};
