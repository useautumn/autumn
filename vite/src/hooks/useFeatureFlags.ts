import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

type AnalyticsMaintenance = {
	disableRevenueMetrics: boolean;
};

type MaintenanceModes = {
	analytics: AnalyticsMaintenance;
};

export type FeatureFlags = {
	maintenanceModes: MaintenanceModes;
};

const DEFAULT_FLAGS: FeatureFlags = {
	maintenanceModes: {
		analytics: {
			disableRevenueMetrics: false,
		},
	},
};

export const useFeatureFlags = () => {
	const axiosInstance = useAxiosInstance();

	const { data, isLoading, isPlaceholderData } = useQuery({
		queryKey: ["feature-flags"],
		queryFn: async (): Promise<FeatureFlags> => {
			const { data } = await axiosInstance.get<FeatureFlags>("/v1/organization/flags");
			// Deep merge with defaults so missing nested keys never cause crashes
			return {
				...DEFAULT_FLAGS,
				...data,
				maintenanceModes: {
					...DEFAULT_FLAGS.maintenanceModes,
					...(data.maintenanceModes ?? {}),
					analytics: {
						...DEFAULT_FLAGS.maintenanceModes.analytics,
						...(data.maintenanceModes?.analytics ?? {}),
					},
				},
			};
		},
		staleTime: 30_000,
		placeholderData: DEFAULT_FLAGS,
	});

	return {
		flags: data ?? DEFAULT_FLAGS,
		isLoading: isLoading || isPlaceholderData,
	};
};
