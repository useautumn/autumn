import type { AxiosInstance } from "axios";
import type { ApiRole, RoleCreateBody, RoleUpdateBody } from "./roleAccess";

export const rolesApi = ({ axios }: { axios: AxiosInstance }) => ({
	list: async () =>
		(await axios.post<{ list: ApiRole[] }>("/roles.list", {})).data.list,
	create: async ({ body }: { body: RoleCreateBody }) =>
		(await axios.post<ApiRole>("/roles.create", body)).data,
	update: async ({ body }: { body: RoleUpdateBody }) =>
		(await axios.post<ApiRole>("/roles.update", body)).data,
	delete: async ({ id }: { id: string }) =>
		(await axios.post<{ id: string }>("/roles.delete", { id })).data,
});
