import type { ApprovalDetail } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type ResolvedApprovalRequest = {
	request: Record<string, unknown>;
	unrepresentable: string[];
};

const RESOLVE_TOOLS: Record<string, string> = {
	attach: "attach",
	updateSubscription: "update_subscription",
};

/** Resolves the approval's stored V1 request into the sheet's V0 dialect via
 * the server, which owns the billing dialects and catalog context. */
export const useResolvedApprovalRequest = ({
	approval,
}: {
	approval: ApprovalDetail | undefined;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const tool = approval ? RESOLVE_TOOLS[approval.tool_name] : undefined;
	const request = approval?.writes[0]?.params.request;

	const { data, error, isLoading } = useQuery<ResolvedApprovalRequest>({
		enabled: Boolean(tool && request),
		queryFn: async () => {
			const { data: body } = await axiosInstance.post(
				"/v1/billing.resolve_request",
				{ request, tool },
			);
			return body;
		},
		queryKey: buildKey(["approval-resolved-request", approval?.id ?? "none"]),
		retry: 1,
	});

	return {
		resolutionFailed: Boolean(error),
		resolutionPending: Boolean(tool && request) && isLoading,
		resolved: data,
	};
};
