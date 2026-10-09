import type {
	ApiByocCache,
	ByocCacheMachine,
	CreateByocCacheParams,
	CreateByocCacheResponse,
	GetByocCacheResponse,
} from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomApi } from "@/contexts/AtomApiContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** Opened inside the click so the browser allows it; the setup link is loaded into it once the server returns one. */
const openSetupTab = (): Window | null => {
	const setupTab = window.open("", "_blank");
	if (setupTab) setupTab.opener = null;
	return setupTab;
};

/** Every Atom write: each lands its result in the query cache, so the page advances without waiting on a poll. */
export const useAtomActions = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const { basePath, queryKey } = useAtomApi();

	const setCache = (cache: ApiByocCache | null) =>
		queryClient.setQueryData<GetByocCacheResponse>(
			queryKey,
			(current) => current && { ...current, cache },
		);
	const refetchCache = () => queryClient.invalidateQueries({ queryKey });

	const postAtom = async <Response>(
		route: string,
		body: object = {},
	): Promise<Response> => {
		const { data } = await axiosInstance.post<Response>(
			`${basePath}/byoc.${route}`,
			body,
		);
		return data;
	};

	const create = useMutation({
		mutationFn: (params: CreateByocCacheParams) =>
			postAtom<CreateByocCacheResponse>("create_atom", params),
		onSuccess: ({ setup_url: _setupUrl, token: _token, ...cache }) =>
			setCache(cache),
	});

	const resize = useMutation({
		mutationFn: ({ cpu, memory }: ByocCacheMachine) =>
			postAtom<ApiByocCache>("resize_atom", { cpu, memory }),
		onSuccess: setCache,
	});

	const retry = useMutation({
		mutationFn: () => postAtom<ApiByocCache>("retry_atom"),
		onSuccess: setCache,
	});

	// A delete keeps the record while the stack is torn down, so read where it landed.
	const remove = useMutation({
		mutationFn: ({ atomId }: { atomId?: string } = {}) =>
			postAtom("delete_atom", { atom_id: atomId }),
		onSuccess: refetchCache,
	});

	/** Creates the setup, then opens its AWS link in a new tab; with no link to open (local dev) the tab closes again. */
	const startSetup = async (params: CreateByocCacheParams): Promise<void> => {
		const setupTab = openSetupTab();
		try {
			const { setup_url: setupUrl } = await create.mutateAsync(params);
			if (setupUrl && setupTab) setupTab.location.href = setupUrl;
			else setupTab?.close();
		} catch (error) {
			setupTab?.close();
			throw error;
		}
	};

	return { create, resize, retry, remove, startSetup };
};

export type AtomActions = ReturnType<typeof useAtomActions>;
