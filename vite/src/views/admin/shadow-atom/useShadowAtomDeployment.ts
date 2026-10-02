import { ByocCacheStatus } from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import type {
	ShadowAtomCreated,
	ShadowAtomDeployment,
	ShadowAtomEnv,
	ShadowAtomMachine,
} from "./shadowAtomTypes";
import { SHADOW_ATOM_CONFIG_QUERY_KEY } from "./useShadowAtomConfig";

const POLL_MS = 10_000;

/** Our shadow Atom on alien: its state, polled until ready, and create / resize / delete. */
export const useShadowAtomDeployment = ({ env }: { env: ShadowAtomEnv }) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const path = `/admin/shadow-atom-config/${env}/deployment`;
	const queryKey = ["admin-shadow-atom-deployment", env];

	const query = useQuery<ShadowAtomDeployment | null>({
		queryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.get(path);
			return data.deployment;
		},
		refetchInterval: (current) =>
			current.state.data?.status === ByocCacheStatus.AwaitingSetup ||
			current.state.data?.status === ByocCacheStatus.Provisioning
				? POLL_MS
				: false,
	});

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey }),
			queryClient.invalidateQueries({ queryKey: SHADOW_ATOM_CONFIG_QUERY_KEY }),
		]);

	const onError = (fallback: string) => (error: unknown) =>
		toast.error(getBackendErr(error, fallback));

	// The mint rotates the admin token, so create is its only caller.
	const create = useMutation({
		mutationFn: async (
			machine: ShadowAtomMachine,
		): Promise<ShadowAtomCreated> => {
			const { data: minted } = await axiosInstance.post(
				"/admin/shadow-atom-config/token",
				{ env },
			);
			const { data } = await axiosInstance.post(path, {
				...machine,
				admin_token_hash: minted.admin_token_hash,
			});
			return {
				adminTokenHash: minted.admin_token_hash,
				setupUrl: data.setup_url,
			};
		},
		onSuccess: () => void refresh(),
		onError: onError("Failed to create the shadow Atom"),
	});

	const resize = useMutation({
		mutationFn: async (machine: ShadowAtomMachine) => {
			await axiosInstance.patch(path, machine);
		},
		onSuccess: () => {
			toast.success("Resize started");
			void refresh();
		},
		onError: onError("Failed to resize the shadow Atom"),
	});

	const remove = useMutation({
		mutationFn: async () => {
			await axiosInstance.delete(path);
		},
		onSuccess: () => {
			toast.success("Shadow Atom deleted");
			create.reset();
			void refresh();
		},
		onError: onError("Failed to delete the shadow Atom"),
	});

	const isBusy = create.isPending || resize.isPending || remove.isPending;

	return { query, create, resize, remove, isBusy };
};
