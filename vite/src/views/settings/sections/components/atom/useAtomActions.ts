import type {
	ApiByocCache,
	ByocCacheMachine,
	CreateByocCacheResponse,
	GetByocCacheResponse,
} from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomQueryKey } from "@/hooks/queries/useAtomQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** Opened inside the click so the browser allows it; the setup link is loaded into it once the server returns one. */
const openSetupTab = (): Window | null => {
	const setupTab = window.open("", "_blank");
	if (setupTab) setupTab.opener = null;
	return setupTab;
};

/** Create, resize and delete write straight into the query cache, so the card advances without a refetch. */
export const useAtomActions = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const queryKey = useAtomQueryKey();

	const setCache = (cache: GetByocCacheResponse["cache"]) =>
		queryClient.setQueryData<GetByocCacheResponse>(
			queryKey,
			(current) => current && { ...current, cache },
		);

	const create = useMutation({
		mutationFn: async ({ cpu, memory }: ByocCacheMachine) => {
			const { data } = await axiosInstance.post<CreateByocCacheResponse>(
				"/v1/byoc.create_atom",
				{ cpu, memory },
			);
			return data;
		},
		onSuccess: ({ setup_url: _setupUrl, ...cache }) => setCache(cache),
	});

	const resize = useMutation({
		mutationFn: async ({ cpu, memory }: ByocCacheMachine) => {
			const { data } = await axiosInstance.post<ApiByocCache>(
				"/v1/byoc.resize_atom",
				{ cpu, memory },
			);
			return data;
		},
		onSuccess: setCache,
	});

	const remove = useMutation({
		mutationFn: async () => {
			await axiosInstance.post("/v1/byoc.delete_atom", {});
		},
		// A delete keeps the record while the stack is torn down, so read where it landed.
		onSuccess: () => queryClient.invalidateQueries({ queryKey }),
	});

	/** Deploys, then opens alien's setup in a new tab; a deploy with no link to open (local dev) closes it again. */
	const startSetup = async (machine: ByocCacheMachine): Promise<void> => {
		const setupTab = openSetupTab();
		try {
			const { setup_url: setupUrl } = await create.mutateAsync(machine);
			if (setupUrl && setupTab) setupTab.location.href = setupUrl;
			else setupTab?.close();
		} catch (error) {
			setupTab?.close();
			throw error;
		}
	};

	return {
		create,
		resize,
		remove,
		startSetup,
		setupUrl: create.data?.setup_url ?? null,
	};
};
