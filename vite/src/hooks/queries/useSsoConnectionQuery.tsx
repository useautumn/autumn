import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/hooks/common/useOrg";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import type { SsoConnectionResponse } from "@/lib/sso/ssoTypes";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/**
 * Fetches the organization's single OIDC SSO connection, if any. `setup` comes
 * back either way so the callback URL is available before setup starts.
 */
export const useSsoConnectionQuery = ({ enabled = true } = {}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { org } = useOrg();

	const { data, isLoading, error, refetch } = useQuery<SsoConnectionResponse>({
		queryKey: buildKey(["org", org?.id, "sso"]),
		queryFn: async () => {
			const { data } = await OrgService.getSso(axiosInstance);
			return data;
		},
		enabled: enabled && !!org?.id,
		retry: false,
	});

	return {
		connection: data?.connection ?? null,
		callbackUrl: data?.setup?.callbackUrl ?? null,
		isLoading,
		error,
		refetch,
	};
};
