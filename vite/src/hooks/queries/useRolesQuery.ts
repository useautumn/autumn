import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { RoleBody } from "@/views/settings/sections/roles/roleAccess";
import {
	createHttpRolesClient,
	getRoleInUseCount,
	mockRolesClient,
	ROLES_MOCKED,
} from "@/views/settings/sections/roles/rolesClient";

const ROLES_KEY = ["roles"] as const;

const useRolesClient = () => {
	const axios = useAxiosInstance();
	return ROLES_MOCKED ? mockRolesClient : createHttpRolesClient({ axios });
};

export const useRolesQuery = () => {
	const client = useRolesClient();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error } = useQuery({
		queryKey: buildKey(ROLES_KEY),
		queryFn: client.list,
	});

	return { roles: data ?? [], isLoading, error };
};

export const useRoleMutations = () => {
	const client = useRolesClient();
	const queryClient = useQueryClient();
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ROLES_KEY });

	const save = useMutation({
		mutationFn: ({ name, body }: { name: string | null; body: RoleBody }) =>
			name ? client.update({ name, body }) : client.create({ body }),
		onSuccess: (_role, { name }) => {
			invalidate();
			toast.success(name ? "Role updated" : "Role created");
		},
		onError: () => toast.error("Failed to save role"),
	});

	const remove = useMutation({
		mutationFn: client.remove,
		onSuccess: () => {
			invalidate();
			toast.success("Role deleted");
		},
		onError: (error) => {
			if (getRoleInUseCount({ error }) !== null) return;
			toast.error("Failed to delete role");
		},
	});

	return { save, remove };
};
