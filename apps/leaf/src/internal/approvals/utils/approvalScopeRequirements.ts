import type { RouteScopeRequirement, ScopeString } from "@autumn/shared";
import { GATED_WRITES } from "../../../../agent/lib/gatedWrites.js";
import { withheldWritesFromToolArgs } from "../../agentRuntime/eve/parkedInput.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";

/** Per-user approval scopes, derived from the authoritative gated-write table.
 * Entries without scopes are intentionally absent — they fail closed here. */
export const approvalScopeRequirements: Record<string, RouteScopeRequirement> =
	Object.fromEntries(
		GATED_WRITES.flatMap((write) =>
			write.scopes ? [[write.toolName, write.scopes] as const] : [],
		),
	);

/** Only plain and ALL requirements can be unioned; an ANY requirement has no
 * sound merge, so a group containing one fails closed. */
const allScopesIn = (
	requirement: RouteScopeRequirement,
): readonly ScopeString[] | undefined => {
	if (!("ALL" in requirement || "ANY" in requirement)) return requirement;
	if ("ANY" in requirement) return undefined;
	return requirement.ALL;
};

/** Approving a grouped card applies every step, so it requires every step's
 * scopes. An unrecognised step fails closed. */
export const requiredScopesForApproval = ({
	groupedToolNames,
	toolArgs,
	toolName,
}: {
	/** Grouped step tool names from step rows; falls back to legacy markers. */
	groupedToolNames?: ReadonlyArray<string>;
	toolArgs?: Record<string, unknown>;
	toolName: string;
}): RouteScopeRequirement | undefined => {
	const primary = approvalScopeRequirements[normalizeToolName(toolName)];
	if (!primary) return undefined;

	const grouped =
		groupedToolNames ??
		withheldWritesFromToolArgs(toolArgs).map((write) => write.toolName);
	if (!grouped.length) return primary;

	const primaryScopes = allScopesIn(primary);
	if (!primaryScopes) return undefined;

	const scopes = new Set<ScopeString>(primaryScopes);
	for (const stepToolName of grouped) {
		const stepRequirement =
			approvalScopeRequirements[normalizeToolName(stepToolName)];
		if (!stepRequirement) return undefined;
		const stepScopes = allScopesIn(stepRequirement);
		if (!stepScopes) return undefined;
		for (const scope of stepScopes) scopes.add(scope);
	}
	return { ALL: [...scopes] };
};
