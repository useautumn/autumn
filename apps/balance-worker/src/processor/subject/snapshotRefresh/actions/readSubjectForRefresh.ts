import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
} from "@autumn/balance-engine";
import { readSubjectRows } from "../../actions/ensureSubject/readSubjectRows.js";
import { SubjectNotFoundError } from "../../subjectErrors.js";
import type { SubjectScope } from "../../types/subject.js";
import type { SubjectRead } from "../../types/subjectRead.js";

const ignoreOthersFailure = (): void => {};

/**
 * The subject's rows for its row, shared with any request that arrives while it reads. A request's own read may have
 * answered from a row, so one in flight is waited out and the rows read afresh. Null when there is nothing to write back.
 */
export const readSubjectForRefresh = async ({
	scope,
	identity,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
}): Promise<SubjectRead | null> => {
	const { inFlightLoads } = scope.state;
	const subjectKey = meteringIdentityToSubjectKey({ identity });
	for (
		let running = inFlightLoads.inFlight({ subjectKey });
		running;
		running = inFlightLoads.inFlight({ subjectKey })
	)
		await running.catch(ignoreOthersFailure);
	try {
		const { read, load } = await inFlightLoads.join({
			subjectKey,
			customerKey: meteringIdentityToPartitionKey({ identity }),
			start: () => readSubjectRows({ scope, identity, rowsOnly: true }),
		});
		// A read an evict overtook may predate the write behind it: the evict's own refresh follows.
		return load.overtaken ? null : read;
	} catch (cause) {
		if (cause instanceof SubjectNotFoundError) return null;
		throw cause;
	}
};
