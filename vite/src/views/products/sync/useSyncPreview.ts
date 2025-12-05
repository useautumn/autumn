import { AppEnv } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

type ItemChange = {
	feature_id: string;
	feature_name: string;
	old_usage: number | string | null;
	new_usage: number | string | null;
};

type PriceChange = {
	old_price: number | null;
	new_price: number | null;
};

type DefaultChange = {
	old_default: boolean;
	new_default: boolean;
};

type FreeTrialChange = {
	old_trial: { length: number; duration: string } | null;
	new_trial: { length: number; duration: string } | null;
};

type ProductChange = {
	id: string;
	name: string;
	changes?: {
		newItems: ItemChange[];
		removedItems: ItemChange[];
		priceChange: PriceChange | null;
		defaultChange: DefaultChange | null;
		freeTrialChange: FreeTrialChange | null;
	};
};

export type SyncPreviewResponse = {
	products: {
		new: ProductChange[];
		updated: ProductChange[];
		unchanged: ProductChange[];
		targetOnly: ProductChange[];
	};
	features: { new: { id: string; name: string }[] };
	defaultConflict: { source: string; target: string } | null;
	defaultWithPrices: { id: string; name: string }[];
	customersAffected: { productId: string; productName: string; customerCount: number }[];
};

export const useSyncPreview = ({ enabled, from }: { enabled: boolean; from: AppEnv }) => {
	const axiosInstance = useAxiosInstance();

	const fetchPreview = async (): Promise<SyncPreviewResponse> => {
		const { data } = await axiosInstance.post("/products/preview_sync", { from });
		return data;
	};

	return useQuery({
		queryKey: ["sync_preview", from],
		queryFn: fetchPreview,
		enabled,
		retry: false,
		staleTime: 0,
	});
};
