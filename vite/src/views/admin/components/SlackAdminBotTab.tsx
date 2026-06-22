import { AppEnv } from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type SlackAdminInstallation = {
  id: string;
  workspace_id: string;
  workspace_name?: string | null;
  bot_user_id?: string | null;
  install_owner_org_id: string;
  install_owner_org_name?: string | null;
  install_owner_org_slug?: string | null;
  default_env: AppEnv;
  updated_at?: number | null;
  installed_by_user_id?: string | null;
  oauth_credentials?: SlackAdminOAuthCredential[];
};

type SlackAdminOAuthCredential = {
  id: string;
  org_id: string;
  env: AppEnv;
  oauth_client_id: string;
  oauth_consent_id?: string | null;
  access_token_expires_at: number;
  updated_at?: number | null;
};

const queryKey = ["admin-slack-admin-bot"];

export const SlackAdminBotTab = () => {
  const axiosInstance = useAxiosInstance();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await axiosInstance.get<{
        installation: SlackAdminInstallation | null;
      }>("/admin/chat/slack-admin");
      return data;
    },
  });

  const installation = data?.installation ?? null;
  const credentials = installation?.oauth_credentials ?? [];
  const installOwnerName =
    installation?.install_owner_org_name ||
    installation?.install_owner_org_slug ||
    installation?.install_owner_org_id;

  const installMutation = useMutation({
    mutationFn: async () => {
      const { data } = await axiosInstance.post<{ url: string }>(
        "/admin/chat/slack-admin/install",
      );
      return data;
    },
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error) => {
      toast.error(getBackendErr(error, "Failed to create Slack install URL"));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      await axiosInstance.delete("/admin/chat/slack-admin");
    },
    onSuccess: async () => {
      toast.success("Slack admin bot revoked");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(getBackendErr(error, "Failed to revoke Slack admin bot"));
    },
  });

  const handleRevoke = () => {
    if (!confirm("Revoke the Slack admin bot installation?")) return;
    revokeMutation.mutate();
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Slack Bot</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Install the admin Slack workspace. Target orgs are selected per
            Slack thread.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className="size-3" />
          Refresh
        </Button>
      </div>

      <div className="border border-border rounded-lg bg-card p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">
                {installation?.workspace_name ?? "No workspace installed"}
              </p>
              <Badge variant={installation ? "muted" : "muted"}>
                {installation ? "Installed" : "Not installed"}
              </Badge>
            </div>
            {installation ? (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {installation.workspace_id}
                {installation.bot_user_id
                  ? ` - Bot ${installation.bot_user_id}`
                  : ""}
              </p>
            ) : null}
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => installMutation.mutate()}
            isLoading={installMutation.isPending}
          >
            <ExternalLink className="size-3" />
            {installation ? "Reinstall" : "Install"}
          </Button>
        </div>

        {installation ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <span className="text-xs text-muted-foreground">
                Install owner org
              </span>
              <p className="mt-1 truncate text-xs font-medium text-foreground">
                {installOwnerName}
              </p>
              <p className="truncate font-mono text-[11px] text-tertiary-foreground">
                {installation.install_owner_org_id}
                {installation.install_owner_org_slug
                  ? ` - ${installation.install_owner_org_slug}`
                  : ""}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <span className="text-xs text-muted-foreground">
                Default environment
              </span>
              <p className="mt-1 text-xs font-medium text-foreground">
                {installation.default_env}
              </p>
            </div>
          </div>
        ) : null}

        {credentials.length > 0 ? (
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Internal OAuth credentials
            </p>
            <div className="mt-2 space-y-1">
              {credentials.map((credential) => (
                <div
                  key={credential.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-tertiary-foreground"
                >
                  <span className="font-medium text-foreground">
                    {credential.env}
                  </span>
                  <span className="font-mono">{credential.org_id}</span>
                  <span>{credential.oauth_client_id}</span>
                  {credential.oauth_consent_id ? (
                    <span className="font-mono">
                      {credential.oauth_consent_id}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex justify-end border-t border-border pt-4">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleRevoke}
            disabled={!installation}
            isLoading={revokeMutation.isPending}
          >
            <Trash2 className="size-3" />
            Revoke
          </Button>
        </div>
      </div>
    </div>
  );
};
