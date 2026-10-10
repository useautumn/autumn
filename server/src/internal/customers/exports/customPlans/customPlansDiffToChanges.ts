import { customDiffToChanges } from "@/internal/customers/cusProducts/actions/deriveIsCustom/customDiffToChanges";
import type {
	CustomDiffChange,
	CustomerProductCustomDiff,
} from "@/internal/customers/cusProducts/actions/deriveIsCustom/types/customerProductCustomDiff";

const changeLabel = ({ target, id }: CustomDiffChange) => {
	if (target === "base_price") return "base price";
	if (target === "license") return `license ${id}`;
	return id ?? "item";
};

const describeChange = (change: CustomDiffChange): string => {
	const label = changeLabel(change);
	if (change.kind !== "changed") return `${label}: ${change.kind}`;
	const fields = change.fields.map(
		({ path, catalog, customer }) =>
			`${path} ${catalog ?? "unset"} → ${customer ?? "unset"}`,
	);
	return `${label}: ${fields.join(", ")}`;
};

export const customPlansDiffToChanges = ({
	diff,
}: {
	diff: CustomerProductCustomDiff;
}): string => customDiffToChanges({ diff }).map(describeChange).join("; ");
