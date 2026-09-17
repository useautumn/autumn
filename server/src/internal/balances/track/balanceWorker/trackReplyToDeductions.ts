import type { TrackReply } from "@autumn/balance-worker-client";
import {
	cusEntsToPlanId,
	cusEntsToReset,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	type TrackDeduction,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

/** The row a delta drew from: a customer entitlement directly, or the one that owns the rollover. */
const customerEntitlementOf = ({
	delta,
	customerEntitlements,
}: {
	delta: TrackReply["result"]["deltas"][number];
	customerEntitlements: FullCusEntWithFullCusProduct[];
}): FullCusEntWithFullCusProduct | undefined =>
	delta.table === "customerEntitlements"
		? customerEntitlements.find((candidate) => candidate.id === delta.id)
		: customerEntitlements.find((candidate) =>
				candidate.rollovers.some((rollover) => rollover.id === delta.id),
			);

/** The API's per-balance breakdown of a worker track: one entry per row drawn from, consumed amounts positive. */
export function trackReplyToDeductions({
	reply,
	fullSubject,
}: {
	reply: TrackReply;
	fullSubject: FullSubject;
}): TrackDeduction[] {
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
	});
	const deductions = new Map<string, TrackDeduction>();

	for (const delta of reply.result.deltas) {
		if (delta.balanceDelta === 0) continue;
		const customerEntitlement = customerEntitlementOf({
			delta,
			customerEntitlements,
		});
		if (!customerEntitlement) continue;

		const key = `${delta.table}:${delta.id}`;
		const value = new Decimal(-delta.balanceDelta);
		const existing = deductions.get(key);
		if (existing) {
			existing.value = new Decimal(existing.value).plus(value).toNumber();
			continue;
		}
		deductions.set(key, {
			balance_id: delta.id,
			feature_id: customerEntitlement.entitlement.feature.id,
			plan_id: cusEntsToPlanId({ cusEnts: [customerEntitlement] }),
			reset: cusEntsToReset({ cusEnts: [customerEntitlement] }),
			value: value.toNumber(),
		});
	}

	return [...deductions.values()];
}
