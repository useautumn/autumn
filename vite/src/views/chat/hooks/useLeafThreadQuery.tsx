import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { LeafUIMessage } from "../chatTypes";

/** Hydrate a dashboard thread's history (text + tool steps + approval cards)
 * from the broker. Fetched once — the live useChat store owns it afterwards. */
export const useLeafThreadQuery = ({
	enabled,
	threadId,
}: {
	enabled: boolean;
	threadId: string;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data } = useQuery<{ messages?: LeafUIMessage[] }>({
		enabled,
		queryFn: async () => {
			const { data: body } = await axiosInstance.get(
				`/agent/chat/${threadId}/messages`,
			);
			return body;
		},
		queryKey: buildKey(["leaf-thread", threadId]),
		staleTime: Number.POSITIVE_INFINITY,
	});

	return { messages: data?.messages };
};
