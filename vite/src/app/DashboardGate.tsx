import { Navigate, Outlet, useLocation } from "react-router";
import { useEffect, useState } from "react";
import {
	getLastSwitchedOrgId,
	useOrg,
	useSwitchActiveOrg,
} from "@/hooks/common/useOrg";
import { useListOrganizations, useSession } from "@/lib/auth-client";
import { getOrgRouteRedirect } from "@/utils/genUtils";
import LoadingScreen from "@/views/general/LoadingScreen";

export const DashboardGate = () => {
	const { pathname, search } = useLocation();
	const { data: session, isPending: sessionLoading } = useSession();
	const { data: orgList, isPending: orgListLoading } = useListOrganizations();
	const switchActiveOrg = useSwitchActiveOrg();
	const { org, isLoading: orgLoading } = useOrg();
	const [switchingToLastOrg, setSwitchingToLastOrg] = useState(false);
	const lastOrgId = getLastSwitchedOrgId();
	const activeOrgId = session?.session.activeOrganizationId;
	const shouldSwitchToLastOrg =
		!!lastOrgId &&
		!!activeOrgId &&
		lastOrgId !== activeOrgId &&
		!!orgList?.some((org) => org.id === lastOrgId);

	useEffect(() => {
		if (!lastOrgId || !shouldSwitchToLastOrg || switchingToLastOrg) return;

		setSwitchingToLastOrg(true);
		switchActiveOrg(lastOrgId).finally(() => {
			setSwitchingToLastOrg(false);
		});
	}, [
		lastOrgId,
		shouldSwitchToLastOrg,
		switchActiveOrg,
		switchingToLastOrg,
	]);

	if (sessionLoading) return <LoadingScreen fullPage />;
	if (!session) return <Navigate to="/sign-in" replace />;
	if (orgListLoading || shouldSwitchToLastOrg || switchingToLastOrg) {
		return <LoadingScreen fullPage />;
	}
	if (orgLoading) return <LoadingScreen fullPage />;
	if (!org) return <LoadingScreen fullPage />;

	const redirect = getOrgRouteRedirect({
		pathname,
		search,
		deployed: org.deployed,
	});
	if (redirect) return <Navigate to={redirect} replace />;

	return <Outlet />;
};
