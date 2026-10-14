import { groupAndFormatScopes, type ScopeActionType } from "@autumn/shared";
import { StatusChip } from "@autumn/ui";

export type ScopePreviewProps = {
	scopes: string[] | null | undefined;
	emptyLabel?: string;
};

function formatActionsCompact(actions: ScopeActionType[]): string {
	const hasRead = actions.includes("read");
	const hasWrite = actions.includes("write");
	if (hasRead && hasWrite) return "R+W";
	if (hasWrite) return "W";
	if (hasRead) return "R";
	return "";
}

export function ScopePreview({
	scopes,
	emptyLabel = "Full access (unrestricted)",
}: ScopePreviewProps) {
	if (!scopes || scopes.length === 0) {
		return <StatusChip>{emptyLabel}</StatusChip>;
	}

	const grouped = groupAndFormatScopes(scopes);

	if (grouped.length === 0) {
		return <StatusChip>{emptyLabel}</StatusChip>;
	}

	return (
		<div className="flex flex-wrap gap-1">
			{grouped.map((g) => (
				<StatusChip key={g.resource}>
					{g.resourceName}: {formatActionsCompact(g.actions)}
				</StatusChip>
			))}
		</div>
	);
}
