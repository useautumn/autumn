import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ROLES_QUERY_KEY } from "@/hooks/queries/useRolesQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	type ApiRole,
	formValuesToCreateBody,
	formValuesToUpdateBody,
	type RoleFormValues,
} from "@/views/settings/sections/roles/roleAccess";
import { getRoleInUseCount } from "@/views/settings/sections/roles/roleErrors";
import { rolesApi } from "@/views/settings/sections/roles/rolesApi";

const MEMBERS_KEY = ["organization-members"] as const;

export const useRoleMutations = () => {
	const api = rolesApi({ axios: useAxiosInstance() });
	const queryClient = useQueryClient();
	// Role changes move member counts and names, so refresh both lists.
	const invalidate = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY }),
			queryClient.invalidateQueries({ queryKey: MEMBERS_KEY }),
		]);

	const save = useMutation({
		mutationFn: ({
			role,
			values,
		}: {
			role: ApiRole | null;
			values: RoleFormValues;
		}) =>
			role === null
				? api.create({ body: formValuesToCreateBody({ values }) })
				: api.update({ body: formValuesToUpdateBody({ role, values }) }),
		// Awaiting the refetch keeps the sheet open until the list shows the change.
		onSuccess: async (_saved, { role }) => {
			toast.success(role === null ? "Role created" : "Role updated");
			await invalidate();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to save role")),
	});

	const remove = useMutation({
		mutationFn: ({ id }: { id: string }) => api.delete({ id }),
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
