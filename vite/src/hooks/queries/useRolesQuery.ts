import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { rolesApi } from "@/views/settings/sections/roles/rolesApi";

export const ROLES_KEY = ["roles"] as const;

// Stub until U3a (#4989) ships the shared hook with this shape; then delete this file.
export const useRolesQuery = () => {
	const axios = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(ROLES_KEY),
		queryFn: () => rolesApi({ axios }).list(),
	});

	return { roles: data ?? [], isLoading, error, refetch };
};
