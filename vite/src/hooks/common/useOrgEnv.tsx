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

  const isValidEnv = env === "live" || env === "sandbox";
  const orgId = org_id ?? "";
  const appEnv = env === "sandbox" ? AppEnv.Sandbox : AppEnv.Live;

  // Compute these unconditionally (safe even if session/orgList are null)
  const userOrgIds = orgList?.map((o) => o.id) ?? [];
  const isInUserOrgs = userOrgIds.includes(orgId);
  const isAlreadyActive = session?.session?.activeOrganizationId === orgId;
  const isAdmin =
    session?.user?.role === "admin" || notNullish(session?.session?.impersonatedBy);

  // ALL useEffect hooks MUST be before any early returns
  useEffect(() => {
    if (isValidEnv) {
      localStorage.setItem("autumn:lastEnv", env!);
    }
  }, [env, isValidEnv]);

  useEffect(() => {
    if (isInUserOrgs && !isAlreadyActive && !syncing && !sessionPending && !orgListPending) {
      setSyncing(true);
      authClient.organization
        .setActive({ organizationId: orgId })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["org"] });
          setSyncing(false);
        })
        .catch(() => {
          setSyncing(false);
        });
    }
  }, [isInUserOrgs, isAlreadyActive, orgId, syncing, queryClient, sessionPending, orgListPending]);

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
    return <LoadingScreen />;
  }

  if (!session) {
    return <Navigate to="/sign-in" />;
  }

  if (syncing) {
    return <LoadingScreen />;
  }

  if (isInUserOrgs) {
    return <Outlet />;
  }

  if (isAdmin) {
    const redirectPath = buildOrgEnvPath({
      orgId,
      env: appEnv,
      path: "/customers",
    });
    return (
      <Navigate
        to={`/impersonate-redirect?org_id=${orgId}&redirect=${encodeURIComponent(redirectPath)}`}
      />
    );
  }

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
  const { data: orgList } = useListOrganizations();

  if (isPending) {
    return <LoadingScreen />;
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
