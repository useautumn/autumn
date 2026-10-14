import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type LeafThreadSummary = {
	id: string;
	title: string | null;
	updatedAt: number;
};

export const useLeafThreadsQuery = ({ enabled }: { enabled: boolean }) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isError, isLoading } = useQuery<{
		threads?: LeafThreadSummary[];
	}>({
		enabled,
		queryFn: async () => {
			const { data: body } = await axiosInstance.get("/agent/chat/threads");
			return body;
		},
		queryKey: buildKey(["leaf-threads"]),
		staleTime: 15_000,
	});

	return {
		threads: data?.threads ?? [],
		threadsError: isError,
		threadsLoading: isLoading,
	};
};
