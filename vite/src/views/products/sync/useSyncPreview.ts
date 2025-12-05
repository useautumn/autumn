import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type SyncPreviewResponse = {
	products: {
		new: { id: string; name: string }[];
		updated: { id: string; name: string }[];
		unchanged: { id: string; name: string }[];
		targetOnly: { id: string; name: string }[];
	};
	features: {
		new: { id: string; name: string }[];
		existing: { id: string; name: string }[];
		targetOnly: { id: string; name: string }[];
	};
	defaultConflict: { source: string; target: string } | null;
	customersAffected: { productId: string; productName: string; customerCount: number }[];
};

export const useSyncPreview = ({ enabled }: { enabled: boolean }) => {
	const axiosInstance = useAxiosInstance();

	const fetchPreview = async (): Promise<SyncPreviewResponse> => {
		const { data } = await axiosInstance.post("/products/preview_sync");
		return data;
	};

	return useQuery({
		queryKey: ["sync_preview"],
		queryFn: fetchPreview,
		enabled,
		retry: false,
	});
};
