import type { ApprovalDetail, ApprovalDetailError } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const approvalDetailErrorFrom = (
	error: unknown,
): ApprovalDetailError | undefined => {
	if (!isAxiosError(error)) return undefined;
	const data = error.response?.data as ApprovalDetailError | undefined;
	return data?.code ? data : undefined;
};

export const useApprovalDetailQuery = ({
	approvalId,
}: {
	approvalId: string | null;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, error } = useQuery<{
		approval: ApprovalDetail;
	}>({
		enabled: Boolean(approvalId),
		queryFn: async () => {
			const { data: body } = await axiosInstance.get(
				`/agent/approvals/${approvalId}`,
			);
			return body;
		},
		queryKey: buildKey(["approval-detail", approvalId ?? "none"]),
		retry: (count, requestError) =>
			count < 2 &&
			(!isAxiosError(requestError) ||
				![403, 404].includes(requestError.response?.status ?? 0)),
	});

	return {
		approval: data?.approval,
		approvalError: approvalDetailErrorFrom(error),
	};
};
