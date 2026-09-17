import {
	type CustomerState,
	type MeteringIdentity,
	meteringIdentityToSubjectKey,
} from "@autumn/balance-engine";
import type { SubjectScope } from "../../types/subject.js";
import { hydrateSubjectState } from "./hydrateSubjectState.js";

/** The freshest state if the worker has one, pending baseline included; otherwise one hydration per subject, which concurrent commands join. */
export const ensureSubjectState = async ({
	scope,
	identity,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
}): Promise<CustomerState> => {
	const state = scope.ctx.writer.readFreshestState({ identity });
	if (state) return state;

	const subjectKey = meteringIdentityToSubjectKey({ identity });
	const inFlight = scope.state.hydrationPromises.get(subjectKey);
	if (inFlight) return await inFlight;

	const hydration = hydrateSubjectState({ scope, identity }).finally(() => {
		scope.state.hydrationPromises.delete(subjectKey);
	});
	scope.state.hydrationPromises.set(subjectKey, hydration);
	return await hydration;
};
