import { AxiosError } from "axios";

type RoleErrorBody = { code?: string; details?: { member_count?: number } };

export const getRoleInUseCount = ({ error }: { error: unknown }) => {
	if (!(error instanceof AxiosError)) return null;
	const data = error.response?.data as RoleErrorBody | undefined;
	if (data?.code !== "role_in_use") return null;
	return data.details?.member_count ?? null;
};
