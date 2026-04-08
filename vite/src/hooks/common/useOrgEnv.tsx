import { AppEnv } from "@autumn/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	Navigate,
	Outlet,
	useLocation,
	useParams,
} from "react-router";
import LoadingScreen from "@/views/general/LoadingScreen";
import { authClient, useListOrganizations, useSession } from "@/lib/auth-client";
import { notNullish, getOrgEnvFromPath, buildOrgEnvPath } from "@/utils/genUtils";
import { attemptInstantImpersonation } from "@/views/admin/adminUtils";

export { getOrgEnvFromPath, buildOrgEnvPath } from "@/utils/genUtils";

export const useOrgId = () => {
	const { pathname } = useLocation();
	const { orgId } = getOrgEnvFromPath(pathname);
	return orgId;
};

export function OrgEnvGuard() {
	const { org_id, env } = useParams<{ org_id: string; env: string }>();
	const { data: session, isPending: sessionPending } = useSession();
	const { data: orgList, isPending: orgListPending } = useListOrganizations();
	const queryClient = useQueryClient();
	const [syncing, setSyncing] = useState(false);
	const [syncError, setSyncError] = useState(false);

	// Slug resolution state
	const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(null);
	const [slugResolving, setSlugResolving] = useState(false);
	const [slugResolutionAttempted, setSlugResolutionAttempted] = useState(false);

	// Instant impersonation state (for cached org→user mappings)
	const [instantImpersonating, setInstantImpersonating] = useState(false);
	const [instantImpersonationAttempted, setInstantImpersonationAttempted] = useState(false);

	const isValidEnv = env === "live" || env === "sandbox";
	const orgId = org_id ?? "";
	const appEnv = env === "sandbox" ? AppEnv.Sandbox : AppEnv.Live;

	// Determine if URL contains a slug or an org ID (slugs are < 15 chars)
	const isSlug = orgId.length > 0 && orgId.length < 15;

	// Try to match from org list (by slug or by id)
	const matchedOrg = isSlug
		? orgList?.find((o) => o.slug === orgId)
		: orgList?.find((o) => o.id === orgId);

	// The actual org ID to use for setActive and API calls
	const effectiveOrgId = matchedOrg?.id ?? resolvedOrgId ?? (isSlug ? null : orgId);

	// Update existing computed values to use effectiveOrgId
	const isInUserOrgs = !!matchedOrg;
	const isAlreadyActive = session?.session?.activeOrganizationId === effectiveOrgId;
	const isAdmin =
		session?.user?.role === "admin" || notNullish(session?.session?.impersonatedBy);

	// ALL useEffect hooks MUST be before any early returns

	// Store env in localStorage on successful render
	useEffect(() => {
		if (isValidEnv) {
			localStorage.setItem("autumn:lastEnv", env!);
		}
	}, [env, isValidEnv]);

		// Effect for admin slug resolution via API
	useEffect(() => {
		if (!isSlug) { setSlugResolutionAttempted(true); return; }
		if (matchedOrg) { setSlugResolutionAttempted(true); return; }
		if (resolvedOrgId) { setSlugResolutionAttempted(true); return; }
		if (slugResolving) { return; }
		if (sessionPending || orgListPending) { return; }
		if (!isAdmin) { setSlugResolutionAttempted(true); return; }

		// Check localStorage cache first
		const slugMap: Record<string, string> = JSON.parse(
			localStorage.getItem("autumn:slugToOrgId") || "{}"
		);
		if (slugMap[orgId]) {
			setResolvedOrgId(slugMap[orgId]);
			setSlugResolutionAttempted(true);
			return;
		}

		// Fetch from admin API
		setSlugResolving(true);
		fetch(
			`${import.meta.env.VITE_BACKEND_URL}/admin/org-by-slug?slug=${encodeURIComponent(orgId)}`,
			{ credentials: "include" }
		)
			.then((res) => {
				if (!res.ok) throw new Error("Not found");
				return res.json();
			})
			.then((data) => {
				if (data.orgId) {
					// Save to localStorage for future use
					slugMap[orgId] = data.orgId;
					localStorage.setItem("autumn:slugToOrgId", JSON.stringify(slugMap));
					setResolvedOrgId(data.orgId);
				}
				setSlugResolving(false);
				setSlugResolutionAttempted(true);
			})
			.catch(() => {
				setSlugResolving(false);
				setSlugResolutionAttempted(true);
			});
	}, [isSlug, matchedOrg, resolvedOrgId, slugResolving, slugResolutionAttempted, isAdmin, orgId, sessionPending, orgListPending]);

	// Effect for instant impersonation (bypasses ImpersonateRedirect page)
	useEffect(() => {
		if (!isAdmin) { setInstantImpersonationAttempted(true); return; }
		if (!effectiveOrgId) { setInstantImpersonationAttempted(true); return; }
		if (isInUserOrgs) { setInstantImpersonationAttempted(true); return; }
		if (instantImpersonating) { return; }
		if (instantImpersonationAttempted) { return; }
		if (sessionPending || orgListPending) { return; }
		if (slugResolving) { return; }

		setInstantImpersonating(true);

		attemptInstantImpersonation({
			orgId: effectiveOrgId,
			slug: orgId, // Keep the original slug in URL
			env: appEnv,
		})
			.then((success) => {
				if (!success) {
					setInstantImpersonating(false);
					setInstantImpersonationAttempted(true);
				}
				// If success, navigation happens in the function
			})
			.catch(() => {
				setInstantImpersonating(false);
				setInstantImpersonationAttempted(true);
			});
	}, [isAdmin, effectiveOrgId, isInUserOrgs, instantImpersonating, instantImpersonationAttempted, sessionPending, orgListPending, slugResolving, orgId, appEnv]);

	// Effect for syncing active organization
	useEffect(() => {
		if (!effectiveOrgId) {
			return;
		}

		// Don't sync if we're attempting instant impersonation
		if (instantImpersonating) {
			return;
		}

		const shouldSync = (isInUserOrgs || resolvedOrgId) && !isAlreadyActive && !syncing && !syncError && !sessionPending && !orgListPending;

		if (shouldSync) {
			setSyncing(true);
			authClient.organization
				.setActive({ organizationId: effectiveOrgId })
				.then(() => {
					queryClient.invalidateQueries({ queryKey: ["org"] });
					setSyncing(false);
				})
				.catch(() => {
					setSyncing(false);
					setSyncError(true);
				});
		}
	}, [effectiveOrgId, isInUserOrgs, resolvedOrgId, isAlreadyActive, syncing, syncError, queryClient, sessionPending, orgListPending, instantImpersonating]);

	// NOW safe to do early returns
	if (!isValidEnv) {
		return (
			<div className="flex h-screen w-full items-center justify-center">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-t1 mb-2">404</h1>
					<p className="text-t3">Invalid environment. Use "live" or "sandbox".</p>
				</div>
			</div>
		);
	}

	if (sessionPending || orgListPending) {
		return (
			<div className="h-screen w-full flex items-center justify-center bg-outer-background">
				<LoadingScreen />
			</div>
		);
	}

	if (!session) {
		return <Navigate to="/sign-in" />;
	}

	if (slugResolving) {
		return (
			<div className="h-screen w-full flex items-center justify-center bg-outer-background">
				<LoadingScreen />
			</div>
		);
	}

	if (syncing) {
		return (
			<div className="h-screen w-full flex items-center justify-center bg-outer-background">
				<LoadingScreen />
			</div>
		);
	}

	if (syncError) {
		// Fall back to first org if sync failed
		if (orgList && orgList.length > 0) {
			return <Navigate to={buildOrgEnvPath({ orgId: orgList[0].id, env: appEnv, path: "/customers" })} />;
		}
		return <Navigate to="/sign-in" />;
	}

	// If slug couldn't be resolved and we're done loading, redirect to first org
	if (isSlug && !matchedOrg && !resolvedOrgId && !slugResolving) {
		// If admin and we haven't attempted resolution yet, wait for the effect to fire
		if (isAdmin && !slugResolutionAttempted) {
			return (
				<div className="h-screen w-full flex items-center justify-center bg-outer-background">
					<LoadingScreen />
				</div>
			);
		}
		// Either non-admin (can't resolve arbitrary slugs) or admin whose resolution already failed
		if (orgList && orgList.length > 0) {
			return <Navigate to={buildOrgEnvPath({ orgId: orgList[0].id, env: appEnv, path: "/customers" })} />;
		}
		return <Navigate to="/sign-in" />;
	}

	if (instantImpersonating) {
		return (
			<div className="h-screen w-full flex items-center justify-center bg-outer-background">
				<LoadingScreen />
			</div>
		);
	}

	if (isInUserOrgs) {
		return <Outlet />;
	}

	if (isAdmin && effectiveOrgId && !isInUserOrgs) {
		// Check if we've already attempted instant impersonation
		if (instantImpersonationAttempted) {
			const redirectPath = buildOrgEnvPath({
				orgId,
				env: appEnv,
				path: "/customers",
			});
			// Note: orgId (from URL) keeps the slug; effectiveOrgId is the real ID for impersonation
			return (
				<Navigate
					to={`/impersonate-redirect?org_id=${effectiveOrgId}&redirect=${encodeURIComponent(redirectPath)}`}
				/>
			);
		}
		// If instant impersonation hasn't been attempted yet, we're waiting for the effect
		return (
			<div className="h-screen w-full flex items-center justify-center bg-outer-background">
				<LoadingScreen />
			</div>
		);
	}

	// Not in org list, not admin — redirecting to first org
	if (orgList && orgList.length > 0) {
		const firstOrgId = orgList[0].id;
		return (
			<Navigate
				to={buildOrgEnvPath({
					orgId: firstOrgId,
					env: appEnv,
					path: "/customers",
				})}
			/>
		);
	}

	return <Navigate to="/sign-in" />;
}

export function RootRedirect() {
	const { data: session, isPending } = useSession();
	const { data: orgList, isPending: orgListPending } = useListOrganizations();

	if (isPending || orgListPending) {
		return (
			<div className="h-screen w-full flex items-center justify-center bg-outer-background">
				<LoadingScreen />
			</div>
		);
	}

	if (!session) {
		return <Navigate to="/sign-in" />;
	}

	// Get org_id: prefer active org, fall back to first org
	const orgId =
		session.session.activeOrganizationId ?? orgList?.[0]?.id;

	if (!orgId) {
		return <Navigate to="/sign-in" />;
	}

	// Get env from localStorage or default to sandbox
	const env = localStorage.getItem("autumn:lastEnv") || "sandbox";
	const appEnv = env === "live" ? AppEnv.Live : AppEnv.Sandbox;

	return (
		<Navigate
			to={buildOrgEnvPath({
				orgId,
				env: appEnv,
				path: "/customers",
			})}
		/>
	);
}
