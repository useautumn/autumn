import { AppEnv } from "@autumn/shared";
import { useCallback } from "react";
import { useActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { useEnv } from "@/utils/envUtils";
import { useOrg } from "./useOrg";

/**
 * Builds query keys scoped to the current env + org + active sandbox, so
 * switching into a sandbox sub-org refetches (and re-scopes) instead of
 * serving cached main-org data.
 */
export const useQueryKeyFactory = () => {
	const env = useEnv();
	const { org } = useOrg();
	const activeSandbox = useActiveSandbox();
	const orgId = org?.id;
	const sandboxId = env === AppEnv.Sandbox ? (activeSandbox?.id ?? null) : null;

	return useCallback(
		(key: readonly unknown[]) => [...key, env, orgId, sandboxId],
		[env, orgId, sandboxId],
	);
};
