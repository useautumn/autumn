import { useCallback } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** After a sheet apply that BYPASSED the approval (user edited or applied
 * normally), the originating Slack approval must not stay pending — it is
 * superseded and its card updated. */
export const useApprovalAwareOnSuccess = ({
	approvalId,
	onDone,
}: {
	approvalId?: string | null;
	onDone: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	return useCallback(() => {
		if (approvalId) {
			void axiosInstance
				.post(`/agent/approvals/${approvalId}/supersede`)
				.catch(() => {
					toast.warning(
						"Applied, but the Slack approval card could not be updated.",
					);
				});
		}
		onDone();
	}, [approvalId, axiosInstance, onDone]);
};
