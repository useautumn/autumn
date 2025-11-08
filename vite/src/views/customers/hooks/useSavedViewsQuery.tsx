import { useGeneralQuery } from "@/hooks/queries/useGeneralQuery";
import { useEnv } from "@/utils/envUtils";

export const useSavedViewsQuery = () => {
	const env = useEnv();
	return useGeneralQuery({
		url: "/saved_views",
		method: "GET",
		queryKey: ["saved_views", env],
	});
};
