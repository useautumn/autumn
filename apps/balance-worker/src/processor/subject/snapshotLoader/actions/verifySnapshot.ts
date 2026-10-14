import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import type { SubjectScope } from "../../types/subject.js";
import { snapshotDivergenceOf } from "../rules/snapshotDivergenceOf.js";

export const verifySnapshot = ({
	scope,
	identity,
	snapshot,
	baseline,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	snapshot: SubjectState;
	baseline: SubjectState;
}): void => {
	const fields = snapshotDivergenceOf({ snapshot, baseline });
	if (fields.length === 0) return;
	scope.ctx.logger?.warn?.(
		{ event: "balance_worker.snapshot_mismatch", data: { identity, fields } },
		`Balance worker's snapshot of ${identity.customerId} disagrees with its rows on ${fields.join(", ")}`,
	);
};
