import { isAxiosError } from "axios";
import { useCallback } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useApprovalSeedStore } from "../stores/useApprovalSeedStore";

/** After ANY successful sheet apply, the originating Slack approval must not
 * stay pending — settle it in the background and update its card. */
export const useSettleApprovalOnApply = () => {
	const axiosInstance = useAxiosInstance();
	const approvalId = useApprovalSeedStore((state) => state.approvalId);
	const clearApprovalId = useApprovalSeedStore(
		(state) => state.clearApprovalId,
	);
	return useCallback(() => {
		if (!approvalId) return;
		clearApprovalId();
		void axiosInstance
			.post(`/agent/approvals/${approvalId}/supersede`)
			.catch((error) => {
				if (isAxiosError(error) && error.response?.status === 409) {
					toast.info(
						"Applied — the Slack request had already been decided or withdrawn.",
					);
					return;
				}
				toast.warning(
					"Applied, but the Slack approval card could not be updated.",
				);
			});
	}, [approvalId, axiosInstance, clearApprovalId]);
};
