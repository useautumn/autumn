import type { CustomerProductCustomDiff } from "./types/customerProductCustomDiff";
import type { CustomReason } from "./types/customerProductIsCustomResult";

type Change = "added" | "removed" | "changed";

const changeOf = ({
	catalog,
	customer,
}: {
	catalog: unknown;
	customer: unknown;
}): Change => {
	if (catalog == null) return "added";
	if (customer == null) return "removed";
	return "changed";
};

export const customDiffToReasons = ({
	diff,
}: {
	diff: CustomerProductCustomDiff;
}): CustomReason[] => [
	...(diff.price ? [{ kind: `price_${changeOf(diff.price)}` as const }] : []),
	...(diff.items ?? []).map((item) => ({
		kind: `item_${changeOf(item)}` as const,
		feature_id: item.feature_id,
	})),
	...(diff.licenses ?? []).map((license) => ({
		kind: `license_${changeOf(license)}` as const,
		license_plan_id: license.license_plan_id,
	})),
];
