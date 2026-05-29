import { useQuery } from "@tanstack/react-query";
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
	const buildKey = useQueryKeyFactory();

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
		queryKey: buildKey(["revenuecat-projects"]),
		queryFn: fetcher,
		enabled,
	});

	return {
		projects,
		isLoading,
		error,
		refetch,
	};
};
