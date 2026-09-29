import type { MeteringIdentity } from "@autumn/balance-engine";
import type { Subject, SubjectScope } from "../../types/subject.js";
import { ensureSubjectCatalog } from "./ensureSubjectCatalog.js";
import { ensureSubjectState } from "./ensureSubjectState.js";

/** Runs before the writer's critical section: everything a decision needs is local once this resolves. */
export const ensureSubject = async ({
	scope,
	identity,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
}): Promise<Subject> => {
	const state = await ensureSubjectState({ scope, identity });
	const catalog = await ensureSubjectCatalog({ scope, identity, state });
	return { state, catalog };
};
