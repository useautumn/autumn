import type { MeteringIdentity } from "../../models/meteringIdentity.js";
import type { SubjectState } from "../../models/subjectState.js";
import { parseSubjectState } from "../../parsers.js";

type SubjectStateRows = Partial<
	Pick<
		SubjectState,
		"customerProducts" | "customerEntitlements" | "rollovers" | "entities"
	>
>;

export const createSubjectState = ({
	identity,
	customerProducts = [],
	customerEntitlements = [],
	rollovers = [],
	entities = [],
}: { identity: MeteringIdentity } & SubjectStateRows): SubjectState =>
	parseSubjectState({
		input: {
			schemaVersion: 1,
			identity,
			revision: 0,
			customerProducts,
			customerEntitlements,
			rollovers,
			entities,
		},
	});
