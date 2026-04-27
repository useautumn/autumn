import type { AppEnv, FrontendOrg } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { authClient, useListOrganizations } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";

const LAST_ORG_KEY = "autumn_last_active_org_id";

export const setLastSwitchedOrgId = (id: string) => {
	try {
		localStorage.setItem(LAST_ORG_KEY, id);
	} catch {}
};

export const getLastSwitchedOrgId = (): string | null => {
	try {
		return localStorage.getItem(LAST_ORG_KEY);
	} catch {
		return null;
	}
};

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

	useEffect(() => {
		if (org?.id) {
			setLastSwitchedOrgId(org.id);
		}
	}, [org?.id]);

	useEffect(() => {
		const handleNoActiveOrg = async () => {
			if (!orgList || orgList.length === 0) {
				console.log("No org to set active, signing out");
				await authClient.signOut();
				window.location.href = "/sign-in";
				return;
			}

			const lastOrgId = getLastSwitchedOrgId();
			const preferredOrg = lastOrgId
				? orgList.find((o) => o.id === lastOrgId)
				: null;
			const targetOrgId = preferredOrg?.id ?? orgList[0].id;

			await authClient.organization.setActive({
				organizationId: targetOrgId,
			});
			window.location.reload();
		};

		if (!org && !isLoading) {
			handleNoActiveOrg();
		}
	}, [org, orgList, isLoading]);

	return { org: org as FrontendOrg, isLoading, error, mutate: refetch };
};
