import type {
	CreateByocCacheResponse,
	GetByocCacheResponse,
} from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useByocCacheQueryKey } from "@/hooks/queries/useByocCacheQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** Opened inside the click so the browser allows it; the setup link is loaded into it once the server returns one. */
const openSetupTab = (): Window | null => {
	const setupTab = window.open("", "_blank");
	if (setupTab) setupTab.opener = null;
	return setupTab;
};

/** Create and delete write straight into the query cache, so the card advances without a refetch. */
export const useByocCacheActions = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const queryKey = useByocCacheQueryKey();

	const setCache = (cache: GetByocCacheResponse["cache"]) =>
		queryClient.setQueryData<GetByocCacheResponse>(queryKey, { cache });

	const create = useMutation({
		mutationFn: async () => {
			const { data } = await axiosInstance.post<CreateByocCacheResponse>(
				"/v1/byoc.create_atom",
				{},
			);
			return data;
		},
		onSuccess: ({ setup_url: _setupUrl, ...cache }) => setCache(cache),
	});

	const remove = useMutation({
		mutationFn: async () => {
			await axiosInstance.post("/v1/byoc.delete_atom", {});
		},
		onSuccess: () => setCache(null),
	});

	/** Deploys, then opens alien's setup in a new tab; a deploy with no link to open (local dev) closes it again. */
	const startSetup = async (): Promise<void> => {
		const setupTab = openSetupTab();
		try {
			const { setup_url: setupUrl } = await create.mutateAsync();
			if (setupUrl && setupTab) setupTab.location.href = setupUrl;
			else setupTab?.close();
		} catch (error) {
			setupTab?.close();
			throw error;
		}
	};

	return {
		create,
		remove,
		startSetup,
		setupUrl: create.data?.setup_url ?? null,
	};
};
