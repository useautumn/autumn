import { useCallback } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** After ANY successful sheet apply, the originating Slack approval must not
 * stay pending — settle it in the background and update its card. */
export const useSettleApprovalOnApply = ({
	approvalId,
}: {
	approvalId?: string | null;
}) => {
	const axiosInstance = useAxiosInstance();
	return useCallback(() => {
		if (!approvalId) return;
		void axiosInstance
			.post(`/agent/approvals/${approvalId}/supersede`)
			.catch(() => {
				toast.warning(
					"Applied, but the Slack approval card could not be updated.",
				);
			});
	}, [approvalId, axiosInstance]);
};
