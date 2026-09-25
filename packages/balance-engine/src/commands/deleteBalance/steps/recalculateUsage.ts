import { cusEntsToUsage } from "@autumn/shared";
import { deduct } from "../../../deduction/deduct.js";
import { toBalanceEditRequest } from "../../../deduction/toBalanceEditRequest.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../../models/subject/workerFullSubject.js";
import { fullSubjectWithCustomerEntitlements } from "../../../utils/subjectUtils/convertSubjectUtils.js";
import { selectBalanceRows } from "../../common/selectBalanceRows.js";
import type { DeleteBalanceCommand } from "../types/deleteBalanceCommand.js";
import { overageCarrierToRowChange } from "./overageCarrierToRowChange.js";

export type UsageRecalculation = {
	changes: RowChange[];
	/** The deleted grant kept to carry the usage; null when the usage went elsewhere, or there was none. */
	overageCarrierId: string | null;
};

const NO_RECALCULATION: UsageRecalculation = {
	changes: [],
	overageCarrierId: null,
};

/**
 * Legacy `recalculate_balances`: the deleted grants' usage is kept. It is drawn from the feature's rows that remain,
 * like a balance update; with none left, the first deleted grant stays behind as the overage carrier.
 */
export const recalculateUsage = ({
	fullSubject,
	command,
	deletedRows,
}: {
	fullSubject: WorkerFullSubject;
	command: DeleteBalanceCommand;
	deletedRows: WorkerFullCustomerEntitlementWithProduct[];
}): UsageRecalculation => {
	const entityId = fullSubject.entity?.id ?? null;
	const usage = cusEntsToUsage({
		cusEnts: deletedRows,
		entityId: entityId ?? undefined,
	});
	const [carrier] = deletedRows;
	if (!carrier || usage === 0) return NO_RECALCULATION;

	const featureId = command.featureId ?? carrier.entitlement.feature.id;
	const deletedIds = new Set(deletedRows.map(({ id }) => id));
	const remaining = fullSubjectWithCustomerEntitlements({
		fullSubject,
		edit: (row) => (deletedIds.has(row.id) ? null : row),
	});
	const hasRowsLeft =
		selectBalanceRows({
			fullSubject: remaining,
			featureId,
			now: command.occurredAt,
		}).length > 0;

	if (hasRowsLeft) {
		const { changes } = deduct({
			fullSubject: remaining,
			request: toBalanceEditRequest({
				featureId,
				internalFeatureId: carrier.internal_feature_id,
				value: usage,
				includesCreditSystems: false,
				countsUsageWindows: false,
				org: command.org,
				now: command.occurredAt,
			}),
		});
		return { changes, overageCarrierId: null };
	}

	return {
		changes: [
			overageCarrierToRowChange({ carrier, deletedRows, entityId, usage }),
		],
		overageCarrierId: carrier.id,
	};
};
