import type { AppEnv, FrontendOrg } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { authClient, useListOrganizations } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";

let lastSwitchedOrgId: string | null = null;
export const setLastSwitchedOrgId = (id: string) => {
	lastSwitchedOrgId = id;
};
export const getLastSwitchedOrgId = () => lastSwitchedOrgId;

export const useOrg = (params?: { env?: AppEnv }) => {
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
		queryKey: params?.env ? ["org", params.env] : ["org"],
		queryFn: fetcher,
		placeholderData: keepPreviousData,
		refetchOnWindowFocus: true,
		staleTime: 30_000,
	});

	useEffect(() => {
		const handleNoActiveOrg = async () => {
			if (orgList && orgList.length > 0) {
				await authClient.organization.setActive({
					organizationId: orgList[0].id,
				});
				window.location.reload();
			} else {
				console.log("No org to set active, signing out");
				await authClient.signOut();
				window.location.href = "/sign-in";
			}
		};

		if (!org && !isLoading) {
			handleNoActiveOrg();
		}
	}, [org, orgList, isLoading]);

	return { org: org as FrontendOrg, isLoading, error, mutate: refetch };
};
