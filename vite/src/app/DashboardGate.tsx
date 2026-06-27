import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { toast } from "sonner";
import { useHasPasskey } from "@/hooks/common/useHasPasskey";
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
	const { org, isLoading: orgLoading, error: orgError } = useOrg();
	const { hasPasskey } = useHasPasskey();
	const [switchingToLastOrg, setSwitchingToLastOrg] = useState(false);
	const [ignoredLastOrgId, setIgnoredLastOrgId] = useState<string | null>(null);
	const lastOrgId = getLastSwitchedOrgId();
	const activeOrgId = session?.session.activeOrganizationId;
	const onImpersonateRoute = pathname.includes("impersonate-redirect");

	// The hand-rolled /api/auth/organization/list response includes
	// requirePasskey per org; better-auth's plugin type doesn't know
	// about it. See handleListAuthOrganizations.ts.
	const typedOrgList = orgList as
		| Array<{ id: string; requirePasskey?: boolean }>
		| undefined;
	const lastOrgEntry = typedOrgList?.find((o) => o.id === lastOrgId);
	const lastOrgGated =
		lastOrgEntry?.requirePasskey === true && !hasPasskey;

	const shouldSwitchToLastOrg =
		!onImpersonateRoute &&
		!!lastOrgId &&
		lastOrgId !== ignoredLastOrgId &&
		!!activeOrgId &&
		lastOrgId !== activeOrgId &&
		!!typedOrgList?.some((o) => o.id === lastOrgId) &&
		// Skip the auto-switch when the remembered org requires a passkey
		// the user doesn't have. The server hook would silently rewrite
		// the active org back to a non-gated one, creating an infinite
		// switch loop here.
		!lastOrgGated;

	useEffect(() => {
		if (!lastOrgId) return;
		if (lastOrgGated && lastOrgId !== ignoredLastOrgId) {
			toast.error(
				"You need a passkey to access that organization. Add one from account settings.",
			);
			clearLastSwitchedOrgId(lastOrgId);
			setIgnoredLastOrgId(lastOrgId);
		}
	}, [lastOrgId, lastOrgGated, ignoredLastOrgId]);

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

	// Only resolve the env redirect once the org is settled. Redirecting on a
	// transitional org (e.g. a stale sandbox-only org during the login switch)
	// would strand a user with production in sandbox.
	const orgSettled =
		!orgLoading && !shouldSwitchToLastOrg && !switchingToLastOrg;
	if (org && orgSettled) {
		const redirect = getOrgRouteRedirect({
			pathname,
			search,
			deployed: org.deployed,
		});
		if (redirect) return <Navigate to={redirect} replace />;
	}

	return <Outlet />;
};
