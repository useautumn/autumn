import type { MigrationItemRunSkipReason } from "@autumn/shared";

export type SkipBadgeSpec = {
	label: string;
	noChanges: boolean;
};

function isNoOpResponse(response: Record<string, unknown> | null): boolean {
	if (!response) return false;
	const preview = response.preview as
		| {
				plan_changes?: unknown[];
				balance_changes?: unknown[];
				flag_changes?: unknown[];
		  }
		| undefined;
	if (!preview) return false;
	return (
		(preview.plan_changes?.length ?? 0) === 0 &&
		(preview.balance_changes?.length ?? 0) === 0 &&
		(preview.flag_changes?.length ?? 0) === 0
	);
}

/** Rows written before skip_reason existed fall back to an empty-preview sniff. */
export function skipBadgeSpec({
	skipReason,
	response,
}: {
	skipReason: MigrationItemRunSkipReason | null | undefined;
	response: Record<string, unknown> | null;
}): SkipBadgeSpec {
	if (skipReason === "no_updates_needed")
		return { label: "No Changes", noChanges: true };
	if (skipReason === "ineligible")
		return { label: "Skipped — ineligible", noChanges: false };
	if (isNoOpResponse(response)) return { label: "No Changes", noChanges: true };
	return { label: "Skipped", noChanges: false };
}

export function skipReasonFromResponse(
	response: Record<string, unknown> | null,
): MigrationItemRunSkipReason | null {
	const reason = response?.skip_reason;
	return reason === "no_updates_needed" || reason === "ineligible"
		? reason
		: null;
}
