import { useEnv } from "@/utils/envUtils";
import { useOrg } from "./useOrg";

/**
 * Builds query keys scoped to the current env + org.
 * Prevents cross-env and cross-org cache collisions.
 */
export const useQueryKeyFactory = () => {
	const env = useEnv();
	const { org } = useOrg();
	return (key: readonly unknown[]) => [...key, env, org?.id];
};
