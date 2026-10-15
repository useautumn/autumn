import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import type {
	ApiRole,
	RoleBody,
} from "@/views/settings/sections/roles/roleAccess";
import { getRoleInUseCount } from "@/views/settings/sections/roles/roleErrors";

const ROLES_KEY = ["roles"] as const;

export const useRolesQuery = () => {
	const axios = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(ROLES_KEY),
		queryFn: async () =>
			(await axios.get<{ list: ApiRole[] }>("/roles")).data.list,
	});

	return { roles: data ?? [], isLoading, error, refetch };
};

export const useRoleMutations = () => {
	const axios = useAxiosInstance();
	const queryClient = useQueryClient();
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ROLES_KEY });

	const save = useMutation({
		mutationFn: ({ name, body }: { name: string | null; body: RoleBody }) =>
			name === null
				? axios.post<ApiRole>("/roles", body)
				: axios.patch<ApiRole>(`/roles/${name}`, body),
		// Returning the refetch keeps the sheet open until the list shows the change.
		onSuccess: async (_role, { name }) => {
			toast.success(name === null ? "Role created" : "Role updated");
			await invalidate();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to save role")),
	});

	const remove = useMutation({
		mutationFn: ({ name }: { name: string }) => axios.delete(`/roles/${name}`),
		onSuccess: async () => {
			toast.success("Role deleted");
			await invalidate();
		},
		onError: (error) => {
			if (getRoleInUseCount({ error }) !== null) return;
			toast.error("Failed to delete role");
		},
	});

	return { save, remove };
};
