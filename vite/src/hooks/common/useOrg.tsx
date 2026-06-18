import type { AppEnv, FrontendOrg } from "@autumn/shared";
import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { authClient, useListOrganizations, useSession } from "@/lib/auth-client";
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

export const useSwitchActiveOrg = () => {
	const queryClient = useQueryClient();
	const { refetch: refetchSession } = useSession();

	return useCallback(async (orgId: string) => {
		await authClient.organization.setActive({ organizationId: orgId });
		setLastSwitchedOrgId(orgId);
		await Promise.all([
			refetchSession(),
			queryClient.invalidateQueries({ queryKey: ["org"] }),
		]);
	}, [queryClient, refetchSession]);
};

export const useOrg = (params?: { env?: AppEnv }) => {
	const currentEnv = useEnv();
	const axiosInstance = useAxiosInstance({ env: params?.env });
	const { data: orgList, isPending: orgListLoading } = useListOrganizations();
	const { data: session } = useSession();
	const activeOrgId = session?.session.activeOrganizationId;

	const fetcher = async () => {
		const { data } = await axiosInstance.get("/organization");
		return data;
	};

	const {
		data: org,
		isLoading,
		isPlaceholderData,
		error,
		refetch,
	} = useQuery({
		queryKey: ["org", params?.env ?? currentEnv, activeOrgId],
		queryFn: fetcher,
		placeholderData: keepPreviousData,
		refetchOnWindowFocus: true,
		staleTime: 30_000,
		enabled: !!activeOrgId,
	});
	const orgLoading =
		!session || (!!activeOrgId && (isLoading || isPlaceholderData));

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

		if (session && !activeOrgId && !orgListLoading) {
			handleNoActiveOrg();
		}
	}, [activeOrgId, orgList, orgListLoading, session]);

	return {
		org: org as FrontendOrg,
		isLoading: orgLoading,
		error,
		mutate: refetch,
	};
};
