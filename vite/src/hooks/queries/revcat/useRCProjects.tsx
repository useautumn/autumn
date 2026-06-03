import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

interface RevenueCatProject {
	id: string;
	name: string;
}

interface RevenueCatProjectsResponse {
	projects: RevenueCatProject[];
}

export const useRCProjects = ({ enabled = true }: { enabled?: boolean } = {}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	const queryKey = buildKey(["revenuecat-projects"]);

	const fetcher = async () => {
		try {
			const { data }: { data: RevenueCatProjectsResponse } =
				await axiosInstance.get("/v1/organization/revenuecat/projects");
			return data.projects || [];
		} catch (_error) {
			return [];
		}
	};

	const {
		data: projects = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey,
		queryFn: fetcher,
		enabled,
	});

	const createMutation = useMutation({
		mutationFn: async (name: string) => {
			const { data } = await axiosInstance.post<RevenueCatProject>(
				"/v1/organization/revenuecat/projects",
				{ name },
			);
			return data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey });
		},
	});

	return {
		projects,
		isLoading,
		error,
		refetch,
		createProject: createMutation.mutateAsync,
		isCreating: createMutation.isPending,
	};
};
