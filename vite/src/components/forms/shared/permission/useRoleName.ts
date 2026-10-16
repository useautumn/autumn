import { useRolesQuery } from "@/hooks/queries/useRolesQuery";

/** `allowed_roles` carries role ids; show each role's name, or the id until roles load. */
export const useRoleName = () => {
	const { roles } = useRolesQuery();
	return (id: string) => roles.find((role) => role.id === id)?.name ?? id;
};
