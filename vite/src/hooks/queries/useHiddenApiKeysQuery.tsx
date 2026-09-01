import type { ApiKeyListItem } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useHiddenApiKeysQuery = ({ enabled }: { enabled: boolean }) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return useQuery<ApiKeyListItem[]>({
		queryKey: buildKey(["hidden-api-keys"]),
		queryFn: () => DevService.listHiddenAPIKeys(axiosInstance),
		enabled,
	});
};
