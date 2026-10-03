import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { SubjectScope } from "../../types/subject.js";
import { awaitLoadWithinDeadline } from "./awaitLoadWithinDeadline.js";
import { hydrateSubject } from "./hydrateSubject.js";
import { readSubjectRows } from "./readSubjectRows.js";

export const viewHasEntity = ({
	state,
	identity,
}: {
	state: SubjectState;
	identity: MeteringIdentity;
}): boolean =>
	identity.entityId === null || state.entity?.id === identity.entityId;

/** One read per customer; concurrent commands for the same customer join it, and each makes it resident. */
const hydrateCustomer = ({
	scope,
	identity,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
}): Promise<SubjectState> =>
	hydrateSubject({
		scope,
		identity,
		read: ({ rowsOnly }) =>
			scope.state.inFlightLoads.join({
				subjectKey: meteringIdentityToSubjectKey({ identity }),
				customerKey: meteringIdentityToPartitionKey({ identity }),
				start: () => readSubjectRows({ scope, identity, rowsOnly }),
			}),
	});

/** An entity's rows come with its customer's other cold entities, one statement; each caller makes its own resident. */
const hydrateEntity = ({
	scope,
	identity,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
}): Promise<SubjectState> =>
	hydrateSubject({
		scope,
		identity,
		read: ({ rowsOnly }) =>
			scope.state.entityLoads.load({ identity, rowsOnly }),
	});

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
		await awaitLoadWithinDeadline({
			identity: customerIdentity,
			load: hydrateCustomer({ scope, identity: customerIdentity }),
		});
		state = scope.ctx.writer.readFreshestState({ identity });
	}
	if (!state) throw new Error("Customer state missing after hydration");
	if (viewHasEntity({ state, identity })) return state;
	const hydrated = await awaitLoadWithinDeadline({
		identity,
		load: hydrateEntity({ scope, identity }),
	});
	// The decision reads the freshest merged view, so the catalog must be ensured for that view, not the entity slice alone.
	return scope.ctx.writer.readFreshestState({ identity }) ?? hydrated;
};
