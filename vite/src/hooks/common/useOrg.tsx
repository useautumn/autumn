import type { AppEnv, FrontendOrg } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import {
	authClient,
	useListOrganizations,
	useSession,
} from "@/lib/auth-client";
import {
	clearLastSwitchedOrgId,
	getLastSwitchedOrgId,
	setActiveOrg,
	setLastSwitchedOrgId,
} from "@/lib/orgSync";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";

export {
	clearLastSwitchedOrgId,
	getLastSwitchedOrgId,
	setActiveOrg,
	setLastSwitchedOrgId,
};

export const useSwitchActiveOrg = () => {
	const { refetch: refetchSession } = useSession();

	return useCallback(
		async (orgId: string) => {
			await setActiveOrg(orgId);
			// The org query is keyed on activeOrgId, so refreshing the session
			// (which updates activeOrgId) is enough to refetch the new org. An extra
			// invalidate would force a redundant refetch and flash a skeleton.
			await refetchSession();
		},
		[refetchSession],
	);
};

export const useOrg = (params?: { env?: AppEnv }) => {
	const currentEnv = useEnv();
	const axiosInstance = useAxiosInstance({ env: params?.env, skipSandbox: true });
	const { data: orgList, isPending: orgListLoading } = useListOrganizations();
	const { data: session } = useSession();
	const activeOrgId = session?.session.activeOrganizationId;

	const fetcher = async () => {
		const { data } = await axiosInstance.get("/organization");
		return data;
	};

	const {
		data: org,
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
	const lastOrgId = getLastSwitchedOrgId();
	const rememberedOrgValid =
		orgListLoading || !orgList || orgList.some((o) => o.id === lastOrgId);
	const pendingOrgSwitch =
		!!lastOrgId &&
		!!activeOrgId &&
		lastOrgId !== activeOrgId &&
		rememberedOrgValid;

	const orgIsReady =
		!!org && !!activeOrgId && org.id === activeOrgId && !pendingOrgSwitch;
	const orgLoading = !session || (!!activeOrgId && !orgIsReady);

	useEffect(() => {
		const handleNoActiveOrg = async () => {
			if (!orgList || orgList.length === 0) {
				await authClient.signOut();
				window.location.href = "/sign-in";
				return;
			}

			const lastOrgId = getLastSwitchedOrgId();
			const preferredOrg = lastOrgId
				? orgList.find((o) => o.id === lastOrgId)
				: null;
			const targetOrgId = preferredOrg?.id ?? orgList[0].id;

			await setActiveOrg(targetOrgId);
			window.location.reload();
		};

		const onImpersonateRoute = window.location.pathname.includes(
			"impersonate-redirect",
		);

		if (session && !activeOrgId && !orgListLoading && !onImpersonateRoute) {
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
