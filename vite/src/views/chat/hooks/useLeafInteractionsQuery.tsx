import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { LeafApproval } from "../chatTypes";

/** Pending plan-write approvals for a thread, fetched beside the text stream.
 * Manually refetched once a turn settles (a suspended write records an approval). */
export const useLeafInteractionsQuery = ({
	threadId,
}: {
	threadId: string;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, refetch } = useQuery<{ approvals?: LeafApproval[] }>({
		enabled: false,
		queryFn: async () => {
			const { data: body } = await axiosInstance.get("/agent/interactions", {
				params: { threadId },
			});
			return body;
		},
		queryKey: buildKey(["leaf-interactions", threadId]),
	});

	return { approvals: data?.approvals, refetchInteractions: refetch };
};
