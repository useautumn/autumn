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

	// LOG: Right after computed values
	console.log("[OrgEnvGuard] URL orgId:", orgId, "| isSlug:", isSlug);
	console.log("[OrgEnvGuard] matchedOrg:", matchedOrg?.id ?? "none", "| effectiveOrgId:", effectiveOrgId);
	console.log("[OrgEnvGuard] isInUserOrgs:", isInUserOrgs, "| isAlreadyActive:", isAlreadyActive, "| isAdmin:", isAdmin);
	console.log("[OrgEnvGuard] resolvedOrgId:", resolvedOrgId, "| slugResolving:", slugResolving, "| slugResolutionAttempted:", slugResolutionAttempted, "| instantImpersonating:", instantImpersonating, "| instantImpersonationAttempted:", instantImpersonationAttempted, "| syncing:", syncing, "| syncError:", syncError);
	console.log("[OrgEnvGuard] session activeOrgId:", session?.session?.activeOrganizationId, "| user role:", session?.user?.role, "| impersonatedBy:", session?.session?.impersonatedBy);
	console.log("[OrgEnvGuard] orgList:", orgList?.map(o => ({ id: o.id, slug: o.slug })));

	// ALL useEffect hooks MUST be before any early returns

	// Store env in localStorage on successful render
	useEffect(() => {
		if (isValidEnv) {
			localStorage.setItem("autumn:lastEnv", env!);
		}
	}, [env, isValidEnv]);

	// Effect for admin slug resolution via API
	useEffect(() => {
		console.log("[OrgEnvGuard:slugResolve] Effect triggered — isSlug:", isSlug, "matchedOrg:", !!matchedOrg, "resolvedOrgId:", resolvedOrgId, "slugResolving:", slugResolving, "isAdmin:", isAdmin, "sessionPending:", sessionPending, "orgListPending:", orgListPending);

		if (!isSlug) { console.log("[OrgEnvGuard:slugResolve] Skipping: not a slug"); setSlugResolutionAttempted(true); return; }
		if (matchedOrg) { console.log("[OrgEnvGuard:slugResolve] Skipping: already matched in org list as", matchedOrg.id); setSlugResolutionAttempted(true); return; }
		if (resolvedOrgId) { console.log("[OrgEnvGuard:slugResolve] Skipping: already resolved to", resolvedOrgId); setSlugResolutionAttempted(true); return; }
		if (slugResolving) { console.log("[OrgEnvGuard:slugResolve] Skipping: already resolving"); return; }
		if (sessionPending || orgListPending) { console.log("[OrgEnvGuard:slugResolve] Skipping: still loading session/orgList"); return; }
		if (!isAdmin) { console.log("[OrgEnvGuard:slugResolve] Skipping: not admin, can't resolve arbitrary slugs"); setSlugResolutionAttempted(true); return; }

		console.log("[OrgEnvGuard:slugResolve] Starting slug resolution for:", orgId);

		// Check localStorage cache first
		const slugMap: Record<string, string> = JSON.parse(
			localStorage.getItem("autumn:slugToOrgId") || "{}"
		);
		if (slugMap[orgId]) {
			console.log("[OrgEnvGuard:slugResolve] Found in localStorage cache:", slugMap[orgId]);
			setResolvedOrgId(slugMap[orgId]);
			setSlugResolutionAttempted(true);
			return;
		}

		// Fetch from admin API
		console.log("[OrgEnvGuard:slugResolve] Fetching from API for slug:", orgId);
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
					console.log("[OrgEnvGuard:slugResolve] API returned orgId:", data.orgId);
					// Save to localStorage for future use
					slugMap[orgId] = data.orgId;
					localStorage.setItem("autumn:slugToOrgId", JSON.stringify(slugMap));
					setResolvedOrgId(data.orgId);
				}
				setSlugResolving(false);
				setSlugResolutionAttempted(true);
			})
			.catch((error) => {
				console.log("[OrgEnvGuard:slugResolve] API fetch failed:", error);
				setSlugResolving(false);
				setSlugResolutionAttempted(true);
			});
	}, [isSlug, matchedOrg, resolvedOrgId, slugResolving, slugResolutionAttempted, isAdmin, orgId, sessionPending, orgListPending]);

	// Effect for instant impersonation (bypasses ImpersonateRedirect page)
	useEffect(() => {
		console.log("[OrgEnvGuard:instantImpersonation] Effect triggered — isAdmin:", isAdmin, "effectiveOrgId:", effectiveOrgId, "isInUserOrgs:", isInUserOrgs, "instantImpersonating:", instantImpersonating, "instantImpersonationAttempted:", instantImpersonationAttempted, "sessionPending:", sessionPending, "orgListPending:", orgListPending, "slugResolving:", slugResolving);

		if (!isAdmin) { console.log("[OrgEnvGuard:instantImpersonation] Skipping: not admin"); setInstantImpersonationAttempted(true); return; }
		if (!effectiveOrgId) { console.log("[OrgEnvGuard:instantImpersonation] Skipping: no effectiveOrgId"); setInstantImpersonationAttempted(true); return; }
		if (isInUserOrgs) { console.log("[OrgEnvGuard:instantImpersonation] Skipping: org is in user list"); setInstantImpersonationAttempted(true); return; }
		if (instantImpersonating) { console.log("[OrgEnvGuard:instantImpersonation] Skipping: already attempting"); return; }
		if (instantImpersonationAttempted) { console.log("[OrgEnvGuard:instantImpersonation] Skipping: already attempted"); return; }
		if (sessionPending || orgListPending) { console.log("[OrgEnvGuard:instantImpersonation] Skipping: still loading"); return; }
		if (slugResolving) { console.log("[OrgEnvGuard:instantImpersonation] Skipping: still resolving slug"); return; }

		console.log("[OrgEnvGuard:instantImpersonation] Attempting instant impersonation for org:", effectiveOrgId);
		setInstantImpersonating(true);

		attemptInstantImpersonation({
			orgId: effectiveOrgId,
			slug: orgId, // Keep the original slug in URL
			env: appEnv,
		}).then((success) => {
			if (success) {
				console.log("[OrgEnvGuard:instantImpersonation] Instant impersonation succeeded");
				// Navigation happens in the function, no state change needed
			} else {
				console.log("[OrgEnvGuard:instantImpersonation] Instant impersonation failed or no cache, will fall back to redirect");
				setInstantImpersonating(false);
				setInstantImpersonationAttempted(true);
			}
		});
	}, [isAdmin, effectiveOrgId, isInUserOrgs, instantImpersonating, instantImpersonationAttempted, sessionPending, orgListPending, slugResolving, orgId, appEnv]);

	// Effect for syncing active organization
	useEffect(() => {
		console.log("[OrgEnvGuard:sync] shouldSync check — effectiveOrgId:", effectiveOrgId, "isInUserOrgs:", isInUserOrgs, "resolvedOrgId:", resolvedOrgId, "isAlreadyActive:", isAlreadyActive, "syncing:", syncing, "syncError:", syncError, "sessionPending:", sessionPending, "orgListPending:", orgListPending, "instantImpersonating:", instantImpersonating, "instantImpersonationAttempted:", instantImpersonationAttempted);

		if (!effectiveOrgId) {
			console.log("[OrgEnvGuard:sync] No effectiveOrgId, returning");
			return;
		}

		// Don't sync if we're attempting instant impersonation
		if (instantImpersonating) {
			console.log("[OrgEnvGuard:sync] Skipping: instant impersonation in progress");
			return;
		}

		const shouldSync = (isInUserOrgs || resolvedOrgId) && !isAlreadyActive && !syncing && !syncError && !sessionPending && !orgListPending && !instantImpersonationAttempted;
		console.log("[OrgEnvGuard:sync] shouldSync:", shouldSync);

		if (shouldSync) {
			console.log("[OrgEnvGuard:sync] Calling setActive with:", effectiveOrgId);
			setSyncing(true);
			authClient.organization
				.setActive({ organizationId: effectiveOrgId })
				.then(() => {
					console.log("[OrgEnvGuard:sync] setActive succeeded for:", effectiveOrgId);
					queryClient.invalidateQueries({ queryKey: ["org"] });
					setSyncing(false);
				})
				.catch((error) => {
					console.log("[OrgEnvGuard:sync] setActive FAILED for:", effectiveOrgId, error);
					setSyncing(false);
					setSyncError(true);
				});
		}
	}, [effectiveOrgId, isInUserOrgs, resolvedOrgId, isAlreadyActive, syncing, syncError, queryClient, sessionPending, orgListPending, instantImpersonating, instantImpersonationAttempted]);

	// NOW safe to do early returns
	if (!isValidEnv) {
		console.log("[OrgEnvGuard:render] Invalid env, showing 404");
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
		console.log("[OrgEnvGuard:render] Showing loading — sessionPending:", sessionPending, "orgListPending:", orgListPending);
		return (
			<div className="h-screen w-full flex items-center justify-center bg-outer-background">
				<LoadingScreen />
			</div>
		);
	}

	if (!session) {
		console.log("[OrgEnvGuard:render] No session, redirecting to sign-in");
		return <Navigate to="/sign-in" />;
	}

	if (slugResolving) {
		console.log("[OrgEnvGuard:render] Showing loading — slugResolving");
		return (
			<div className="h-screen w-full flex items-center justify-center bg-outer-background">
				<LoadingScreen />
			</div>
		);
	}

	if (syncing) {
		console.log("[OrgEnvGuard:render] Showing loading — syncing");
		return (
			<div className="h-screen w-full flex items-center justify-center bg-outer-background">
				<LoadingScreen />
			</div>
		);
	}

	if (syncError) {
		console.log("[OrgEnvGuard:render] Sync error, falling back to first org");
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
			console.log("[OrgEnvGuard:render] Admin slug resolution pending — waiting for effect to fire");
			return (
				<div className="h-screen w-full flex items-center justify-center bg-outer-background">
					<LoadingScreen />
				</div>
			);
		}
		// Either non-admin (can't resolve arbitrary slugs) or admin whose resolution already failed
		console.log("[OrgEnvGuard:render] Unresolvable slug (attempted:", slugResolutionAttempted, ") — redirecting to first org");
		if (orgList && orgList.length > 0) {
			return <Navigate to={buildOrgEnvPath({ orgId: orgList[0].id, env: appEnv, path: "/customers" })} />;
		}
		return <Navigate to="/sign-in" />;
	}

	if (instantImpersonating) {
		console.log("[OrgEnvGuard:render] Showing loading — instant impersonation in progress");
		return (
			<div className="h-screen w-full flex items-center justify-center bg-outer-background">
				<LoadingScreen />
			</div>
		);
	}

	if (isInUserOrgs) {
		console.log("[OrgEnvGuard:render] Rendering app — org is in user list and active");
		return <Outlet />;
	}

	if (isAdmin && effectiveOrgId && !isInUserOrgs) {
		// Check if we've already attempted instant impersonation
		if (instantImpersonationAttempted) {
			console.log("[OrgEnvGuard:render] Admin impersonation redirect (instant failed) — effectiveOrgId:", effectiveOrgId, "redirect will keep slug:", orgId);
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
		console.log("[OrgEnvGuard:render] Waiting for instant impersonation attempt");
		return (
			<div className="h-screen w-full flex items-center justify-center bg-outer-background">
				<LoadingScreen />
			</div>
		);
	}

	console.log("[OrgEnvGuard:render] Not in org list, not admin — redirecting to first org");
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
