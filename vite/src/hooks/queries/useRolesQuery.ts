import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import type { RoleBody } from "@/views/settings/sections/roles/roleAccess";
import {
	createHttpRolesClient,
	getMockRolesClient,
	getRoleInUseCount,
	ROLES_MOCKED,
} from "@/views/settings/sections/roles/rolesClient";

const ROLES_KEY = ["roles"] as const;

const useRolesClient = () => {
	const axios = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	if (ROLES_MOCKED)
		return getMockRolesClient({ storeKey: buildKey(ROLES_KEY).join(":") });
	return createHttpRolesClient({ axios });
};

export const useRolesQuery = () => {
	const client = useRolesClient();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(ROLES_KEY),
		queryFn: client.list,
	});

	return { roles: data ?? [], isLoading, error, refetch };
};

export const useRoleMutations = () => {
	const client = useRolesClient();
	const queryClient = useQueryClient();
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ROLES_KEY });

	const save = useMutation({
		mutationFn: ({ name, body }: { name: string | null; body: RoleBody }) =>
			name === null ? client.create({ body }) : client.update({ name, body }),
		onSuccess: (_role, { name }) => {
			invalidate();
			toast.success(name === null ? "Role created" : "Role updated");
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to save role")),
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
