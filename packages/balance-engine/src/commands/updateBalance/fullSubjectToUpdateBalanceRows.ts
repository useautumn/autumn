import {
	fullSubjectToCustomerEntitlements,
	orgToInStatuses,
} from "@autumn/shared";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import type { UpdateBalanceCommand } from "./types/updateBalanceCommand.js";

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
