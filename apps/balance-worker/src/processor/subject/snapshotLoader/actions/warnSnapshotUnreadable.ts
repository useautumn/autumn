import type { MeteringIdentity } from "@autumn/balance-engine";
import type { SubjectScope } from "../../types/subject.js";

/** A row the statement answered that will not parse is nobody's to use; the customer's next flush rewrites it. */
export const warnSnapshotUnreadable = ({
	scope,
	identity,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
}): void => {
	scope.ctx.logger?.warn?.(
		{ event: "balance_worker.snapshot_unreadable", data: { identity } },
		`Balance worker could not read ${identity.customerId}'s snapshot; its next flush rewrites it`,
	);
};
