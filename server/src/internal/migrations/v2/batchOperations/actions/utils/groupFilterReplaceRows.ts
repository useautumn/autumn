import { type EntitlementWithFeature, entsAreSame } from "@autumn/shared";
import { computeCustomerEntitlementPatch } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch.js";
import type { CustomerEntitlementPatch } from "@/internal/billing/v2/actions/batchTransition/types/entitlementPriceOperationTypes.js";

/** Discriminates patches that share one SQL UPDATE. `keep` means omit the column. */
export const customerEntitlementPatchKey = ({
	patch,
}: {
	patch: CustomerEntitlementPatch;
}): string => {
	const balance = patch.balance;
	const balanceKey =
		balance === undefined
			? "balance:keep"
			: `balance:${balance.type}:${balance.amount}`;
	const unlimitedKey =
		patch.unlimited === undefined
			? "unlimited:keep"
			: `unlimited:${patch.unlimited === null ? "null" : String(patch.unlimited)}`;
	return `${balanceKey}|${unlimitedKey}`;
};

const patchForLiveRow = ({
	liveDefinition,
	toEntitlement,
}: {
	liveDefinition: EntitlementWithFeature;
	toEntitlement: EntitlementWithFeature;
}): CustomerEntitlementPatch => {
	if (entsAreSame(liveDefinition, toEntitlement)) return {};
	return computeCustomerEntitlementPatch({
		fromEntitlement: liveDefinition,
		toEntitlement,
	});
};

type FilterReplaceLiveRow = {
	liveDefinition?: EntitlementWithFeature;
};

/** Buckets live from-rows by grant delta so one UPDATE can apply each patch. */
export const groupFilterReplaceRows = <
	LiveRow extends FilterReplaceLiveRow,
>({
	rows,
	toEntitlement,
}: {
	rows: LiveRow[];
	toEntitlement: EntitlementWithFeature;
}): { patch: CustomerEntitlementPatch; rows: LiveRow[] }[] => {
	const groups = new Map<
		string,
		{ patch: CustomerEntitlementPatch; rows: LiveRow[] }
	>();
	for (const liveRow of rows) {
		const liveDefinition = liveRow.liveDefinition;
		if (!liveDefinition || liveDefinition.id === toEntitlement.id) continue;
		const patch = patchForLiveRow({ liveDefinition, toEntitlement });
		const key = customerEntitlementPatchKey({ patch });
		const group = groups.get(key);
		if (group) {
			group.rows.push(liveRow);
			continue;
		}
		groups.set(key, { patch, rows: [liveRow] });
	}
	return [...groups.values()];
};
