import { ensureSubject } from "./actions/ensureSubject/ensureSubject.js";
import { readSubject } from "./actions/readSubject.js";
import type { SubjectHydratorContext, SubjectScope } from "./types/subject.js";
import type { SubjectHydrator } from "./types/subjectHydrator.js";

export const createSubjectHydrator = ({
	ctx,
}: {
	ctx: SubjectHydratorContext;
}): SubjectHydrator => {
	const scope: SubjectScope = {
		ctx,
		state: { hydrationPromises: new Map() },
	};

	return {
		ensure: ({ identity }) => ensureSubject({ scope, identity }),
		readSubject: ({ state, identity }) =>
			readSubject({ scope, state, identity }),
	};
};
