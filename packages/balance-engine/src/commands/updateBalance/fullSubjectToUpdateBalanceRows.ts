import {
	fullSubjectToCustomerEntitlements,
	orgToInStatuses,
} from "@autumn/shared";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import type { UpdateBalanceCommand } from "./types/updateBalanceCommand.js";

/** The rows an update reads, as legacy selects them: the feature's own, or with the credit systems that fund it. */
export const fullSubjectToUpdateBalanceRows = ({
	fullSubject,
	command,
	includesCreditSystems,
}: {
	fullSubject: WorkerFullSubject;
	command: UpdateBalanceCommand;
	includesCreditSystems: boolean;
}) =>
	fullSubjectToCustomerEntitlements({
		fullSubject,
		...(includesCreditSystems
			? { fundsFeatureId: command.featureId }
			: { featureIds: [command.featureId] }),
		customerEntitlementFilters: command.customerEntitlementFilters,
		inStatuses: orgToInStatuses({ org: command.org }),
		now: command.occurredAt,
	});

/** The row whose date comes first, rows without one last: legacy's target for a reset or expiry edit. */
export const findCustomerEntitlementBySoonest = <
	Row extends { next_reset_at: number | null; expires_at: number | null },
>({
	customerEntitlements,
	column,
}: {
	customerEntitlements: Row[];
	column: "next_reset_at" | "expires_at";
}): Row | undefined =>
	[...customerEntitlements].sort(
		(left, right) =>
			(left[column] ?? Number.POSITIVE_INFINITY) -
			(right[column] ?? Number.POSITIVE_INFINITY),
	)[0];
