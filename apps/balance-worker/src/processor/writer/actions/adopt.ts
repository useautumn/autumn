import {
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { PartitionWriterScope } from "../types/partitionWriter.js";

/** Synchronous: fetched rows become the subject's resident state only if nothing fresher is already there. */
export function adopt({
	scope,
	state,
	baselineAt,
}: {
	scope: PartitionWriterScope;
	state: SubjectState;
	baselineAt?: number;
}): SubjectState {
	const subjectKey = meteringIdentityToSubjectKey({ identity: state.identity });
	const existing = scope.state.subjects.readState({ subjectKey });
	if (existing) return existing;
	scope.state.subjects.setState({
		subjectKey,
		customerKey: meteringIdentityToPartitionKey({ identity: state.identity }),
		state,
		baselineAt,
	});
	return state;
}
