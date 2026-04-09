import type { AppEnv, FrontendOrg } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { authClient, useListOrganizations } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";

let lastSwitchedOrgId: string | null = null;
export const setLastSwitchedOrgId = (id: string) => {
	lastSwitchedOrgId = id;
};
export const getLastSwitchedOrgId = () => lastSwitchedOrgId;

export const useOrg = (params?: { env?: AppEnv }) => {
	const currentEnv = useEnv();
	const axiosInstance = useAxiosInstance({ env: params?.env });
	const { data: orgList } = useListOrganizations();

	const fetcher = async () => {
		try {
			const { data } = await axiosInstance.get("/organization");
			return data;
		} catch {
			return null;
		}
	};

	const {
		data: org,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: params?.env ? ["org", params.env] : ["org", currentEnv],
		queryFn: fetcher,
		placeholderData: keepPreviousData,
		refetchOnWindowFocus: true,
		staleTime: 30_000,
	});

	// Note: Org resolution and activation is now handled by OrgEnvGuard
	// This hook just fetches org data based on the current session

	return { org: org as FrontendOrg, isLoading, error, mutate: refetch };
};
