import { AppEnv } from "@autumn/shared";
import { useCallback } from "react";
import { useActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { useEnv } from "@/utils/envUtils";
import { useActiveOrgId } from "./useActiveOrgId";

/**
 * Builds query keys scoped to the current env + org + active sandbox, so
 * switching into a sandbox sub-org refetches (and re-scopes) instead of
 * serving cached main-org data. The org comes from the session (or its last
 * known value) rather than /organization, so keys are stable from the start.
 */
export const useQueryKeyFactory = () => {
	const env = useEnv();
	const { activeOrgId: orgId } = useActiveOrgId();
	const activeSandbox = useActiveSandbox();
	const sandboxId = env === AppEnv.Sandbox ? (activeSandbox?.id ?? null) : null;

	return useCallback(
		(key: readonly unknown[]) => [...key, env, orgId, sandboxId],
		[env, orgId, sandboxId],
	);
};
