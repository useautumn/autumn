import {
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	cusEntToInternalProductId,
	fullSubjectToCustomerEntitlements,
} from "@autumn/shared";
import type { MutationLogItem } from "../utils/types/mutationLogItem.js";

export const resolveInternalProductIdForEvent = ({
	fullSubject,
	mutationLogs,
}: {
	fullSubject: FullSubject;
	mutationLogs: MutationLogItem[];
}): string | null => {
	if (mutationLogs.length === 0) return null;

	const cusEnts = fullSubjectToCustomerEntitlements({ fullSubject });
	const cusEntById = new Map<string, FullCusEntWithFullCusProduct>();
	const rolloverIdToCusEnt = new Map<string, FullCusEntWithFullCusProduct>();

	for (const cusEnt of cusEnts) {
		cusEntById.set(cusEnt.id, cusEnt);
		for (const rollover of cusEnt.rollovers ?? []) {
			rolloverIdToCusEnt.set(rollover.id, cusEnt);
		}
	}

	const NULL_KEY = "__NULL__";
	const sumByKey = new Map<string, number>();
	const keyToIpi = new Map<string, string | null>();

	for (const log of mutationLogs) {
		if (log.balance_delta === 0) continue;

		let cusEnt: FullCusEntWithFullCusProduct | undefined;
		if (log.target_type === "customer_entitlement" && log.customer_entitlement_id) {
			cusEnt = cusEntById.get(log.customer_entitlement_id);
		} else if (log.target_type === "rollover" && log.rollover_id) {
			cusEnt = rolloverIdToCusEnt.get(log.rollover_id);
		}
		if (!cusEnt) continue;

		const ipi = cusEntToInternalProductId({ cusEnt });
		const key = ipi ?? NULL_KEY;
		keyToIpi.set(key, ipi);
		sumByKey.set(key, (sumByKey.get(key) ?? 0) + Math.abs(log.balance_delta));
	}

	if (sumByKey.size === 0) return null;

	let winnerKey: string | null = null;
	let winnerSum = -Infinity;
	for (const [key, sum] of sumByKey) {
		if (sum > winnerSum) {
			winnerSum = sum;
			winnerKey = key;
		}
	}
	return winnerKey === null ? null : (keyToIpi.get(winnerKey) ?? null);
};
