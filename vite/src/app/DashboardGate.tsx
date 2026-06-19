import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import {
	clearLastSwitchedOrgId,
	getLastSwitchedOrgId,
	useOrg,
	useSwitchActiveOrg,
} from "@/hooks/common/useOrg";
import { useListOrganizations, useSession } from "@/lib/auth-client";
import { getOrgRouteRedirect } from "@/utils/genUtils";

export const DashboardGate = () => {
	const { pathname, search } = useLocation();
	const { data: session, isPending: sessionLoading } = useSession();
	const { data: orgList } = useListOrganizations();
	const switchActiveOrg = useSwitchActiveOrg();
	const { org, error: orgError } = useOrg();
	const [switchingToLastOrg, setSwitchingToLastOrg] = useState(false);
	const [ignoredLastOrgId, setIgnoredLastOrgId] = useState<string | null>(null);
	const lastOrgId = getLastSwitchedOrgId();
	const activeOrgId = session?.session.activeOrganizationId;
	const onImpersonateRoute = pathname.includes("impersonate-redirect");
	const shouldSwitchToLastOrg =
		!onImpersonateRoute &&
		!!lastOrgId &&
		lastOrgId !== ignoredLastOrgId &&
		!!activeOrgId &&
		lastOrgId !== activeOrgId &&
		!!orgList?.some((org) => org.id === lastOrgId);

	useEffect(() => {
		if (!lastOrgId || !shouldSwitchToLastOrg || switchingToLastOrg) return;

		const switchToLastOrg = async () => {
			setSwitchingToLastOrg(true);
			try {
				await switchActiveOrg(lastOrgId);
			} catch (error) {
				console.warn("Failed to switch to remembered org", error);
				clearLastSwitchedOrgId(lastOrgId);
				setIgnoredLastOrgId(lastOrgId);
			} finally {
				setSwitchingToLastOrg(false);
			}
		};

		switchToLastOrg();
	}, [
		ignoredLastOrgId,
		lastOrgId,
		shouldSwitchToLastOrg,
		switchActiveOrg,
		switchingToLastOrg,
	]);

	if (!sessionLoading && !session) {
		return <Navigate to="/sign-in" replace />;
	}
	if (orgError) {
		return (
			<div className="flex min-h-screen w-full items-center justify-center">
				<div className="flex max-w-sm flex-col items-center gap-3 text-center">
					<p className="text-sm text-muted-foreground">
						We couldn't load your organization.
					</p>
					<button
						type="button"
						className="text-sm text-tertiary-foreground hover:underline"
						onClick={() => window.location.reload()}
					>
						Refresh
					</button>
				</div>
			</div>
		);
	}

	if (org) {
		const redirect = getOrgRouteRedirect({
			pathname,
			search,
			deployed: org.deployed,
		});
		if (redirect) return <Navigate to={redirect} replace />;
	}

	return <Outlet />;
};
