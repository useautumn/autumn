import { useCallback } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { enterOrgAsAdmin } from "../adminUtils";
import { useAdmin } from "./useAdmin";

/** Enters an org with no members as the signed-in admin. */
export const useEnterOrgAsAdmin = () => {
	// The selected sandbox belongs to the org being left, so its header must not ride along
	const axiosInstance = useAxiosInstance({ skipSandbox: true });
	const { isCurrentlyImpersonating } = useAdmin();

	return useCallback(
		(organizationId: string) =>
			enterOrgAsAdmin({
				axiosInstance,
				organizationId,
				isCurrentlyImpersonating,
			}),
		[axiosInstance, isCurrentlyImpersonating],
	);
};
