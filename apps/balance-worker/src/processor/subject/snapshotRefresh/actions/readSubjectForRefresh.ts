import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
} from "@autumn/balance-engine";
import { readSubjectRows } from "../../actions/ensureSubject/readSubjectRows.js";
import { SubjectNotFoundError } from "../../subjectErrors.js";
import type { SubjectScope } from "../../types/subject.js";
import type { SnapshotRefreshRead } from "../types/snapshotRefreshQueue.js";

const ignoreOthersFailure = (): void => {};

export const readSubjectForRefresh = async ({
	scope,
	identity,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
}): Promise<SnapshotRefreshRead | null> => {
	const { inFlightLoads } = scope.state;
	const subjectKey = meteringIdentityToSubjectKey({ identity });
	const logOffset = bookmarkOf({ scope }) - 1n;
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
		return load.overtaken ? null : { ...read, logOffset };
	} catch (cause) {
		if (cause instanceof SubjectNotFoundError) return null;
		throw cause;
	}
};

const bookmarkOf = ({ scope }: { scope: SubjectScope }): bigint => {
	const { readNextOffset, position } = scope.ctx;
	return (position && readNextOffset?.(position)) ?? 0n;
};
