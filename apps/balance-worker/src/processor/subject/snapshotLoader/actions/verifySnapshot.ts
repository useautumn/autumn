import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import type { SubjectScope } from "../../types/subject.js";
import { snapshotDivergenceOf } from "../rules/snapshotDivergenceOf.js";
import { snapshotStateOf } from "../rules/snapshotStateOf.js";
import { warnSnapshotUnreadable } from "./warnSnapshotUnreadable.js";

/** A row read beside the rows it would have served: where the two disagree is logged, and the rows stay what is served. */
export const verifySnapshot = ({
	scope,
	identity,
	snapshot,
	baseline,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	snapshot: unknown;
	baseline: SubjectState;
}): void => {
	const state = snapshotStateOf({ snapshot });
	if (!state) {
		warnSnapshotUnreadable({ scope, identity });
		return;
	}
	const fields = snapshotDivergenceOf({ snapshot: state, baseline });
	if (fields.length === 0) return;
	scope.ctx.logger?.warn?.(
		{ event: "balance_worker.snapshot_mismatch", data: { identity, fields } },
		`Balance worker's snapshot of ${identity.customerId} disagrees with its rows on ${fields.join(", ")}`,
	);
};
