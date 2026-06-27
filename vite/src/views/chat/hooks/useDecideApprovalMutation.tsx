import { useMutation } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** Resolve a plan-write approval (approve → applies + returns the agent's
 * continuation text; reject → discards). */
export const useDecideApprovalMutation = () => {
	const axiosInstance = useAxiosInstance();

	const { mutateAsync, isPending } = useMutation({
		mutationFn: async ({
			action,
			approvalId,
		}: {
			action: "approve" | "reject";
			approvalId: string;
		}) => {
			const { data } = await axiosInstance.post(`/agent/${action}`, {
				approvalId,
			});
			return data as { error?: string; status?: string; text?: string };
		},
	});

	return { decide: mutateAsync, deciding: isPending };
};
