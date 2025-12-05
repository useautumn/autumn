import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useSyncPreview = ({ enabled }: { enabled: boolean }) => {
	const axiosInstance = useAxiosInstance();

	const fetchPreview = async () => {
		const { data } = await axiosInstance.post("/products/preview_sync");
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["sync_preview"],
		queryFn: fetchPreview,
		enabled,
		retry: false,
	});

	return { data, isLoading, error, refetch };
};
