import type { CreditOverrideRowStatus } from "../utils/diffCreditOverride";

const label: Record<CreditOverrideRowStatus, string | null> = {
	inherited: null,
	changed: "Changed",
	added: "Added",
};

export function RowStatusBadge({
	status,
}: {
	status: CreditOverrideRowStatus;
}) {
	if (!label[status]) return null;
	return (
		<span className="text-tertiary-foreground text-xs">{label[status]}</span>
	);
}
