import {
	type MeteringIdentity,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { SubjectScope } from "../../types/subject.js";
import { hydrateSubjectState } from "./hydrateSubjectState.js";

const viewHasEntity = ({
	state,
	identity,
}: {
	state: SubjectState;
	identity: MeteringIdentity;
}): boolean =>
	identity.entityId === null || state.entity?.id === identity.entityId;

/** One hydration per subject; concurrent commands for the same subject join it. */
const hydrateOnce = ({
	scope,
	identity,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
}): Promise<SubjectState> => {
	const subjectKey = meteringIdentityToSubjectKey({ identity });
	const inFlight = scope.state.hydrationPromises.get(subjectKey);
	if (inFlight) return inFlight;

	const hydration = hydrateSubjectState({ scope, identity }).finally(() => {
		scope.state.hydrationPromises.delete(subjectKey);
	});
	scope.state.hydrationPromises.set(subjectKey, hydration);
	return hydration;
};

/** The freshest view for the identity, pending baseline included; a missing customer hydrates first, then a missing entity. */
export const ensureSubjectState = async ({
	scope,
	identity,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
}): Promise<SubjectState> => {
	const customerIdentity: MeteringIdentity = { ...identity, entityId: null };
	let state = scope.ctx.writer.readFreshestState({ identity });
	if (!state) {
		await hydrateOnce({ scope, identity: customerIdentity });
		state = scope.ctx.writer.readFreshestState({ identity });
	}
	if (!state) throw new Error("Customer state missing after hydration");
	if (viewHasEntity({ state, identity })) return state;
	const hydrated = await hydrateOnce({ scope, identity });
	// The decision reads the freshest merged view, so the catalog must be ensured for that view, not the entity slice alone.
	return scope.ctx.writer.readFreshestState({ identity }) ?? hydrated;
};
