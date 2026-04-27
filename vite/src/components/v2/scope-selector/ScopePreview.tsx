import {
	groupAndFormatScopes,
	type ScopeActionType,
} from "@autumn/shared";
import { Badge } from "@/components/v2/badges/Badge";

export type ScopePreviewProps = {
	scopes: string[] | null | undefined;
	/** Render empty/null as a specific label. Default: "Full access (unrestricted)". */
	emptyLabel?: string;
};

/**
 * Format a sorted action list into a compact badge label:
 *   ["read"]          -> "R"
 *   ["write"]         -> "W"
 *   ["read", "write"] -> "R+W"
 */
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
		return <Badge variant="muted">{emptyLabel}</Badge>;
	}

	const grouped = groupAndFormatScopes(scopes);

	// If the input contained only unknown/OpenID scopes, groupAndFormatScopes
	// returns an empty list. Fall back to the empty label to avoid rendering
	// nothing silently.
	if (grouped.length === 0) {
		return <Badge variant="muted">{emptyLabel}</Badge>;
	}

	return (
		<div className="flex flex-wrap gap-1">
			{grouped.map((g) => (
				<Badge key={g.resource} variant="muted">
					{g.resourceName}: {formatActionsCompact(g.actions)}
				</Badge>
			))}
		</div>
	);
}
