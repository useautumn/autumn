import { CopyButton } from "@autumn/ui";

/**
 * The callback URL is available before a connection exists, so admins can
 * register it with their identity provider first and only then come back with
 * the client credentials it issues.
 */
export const SsoCallbackUrlField = ({
	callbackUrl,
	description = "Add this as the redirect (callback) URL in your OIDC application first — Okta, Entra ID, Auth0 and Google Workspace all require it before they issue client credentials.",
}: {
	callbackUrl: string | null;
	description?: string;
}) => (
	<div className="flex flex-col gap-2 rounded-lg border bg-interactive-secondary p-3">
		<span className="text-sm font-medium text-foreground">
			Autumn callback URL
		</span>
		<p className="text-xs text-tertiary-foreground">{description}</p>
		{callbackUrl ? (
			<div className="flex items-center gap-2 min-w-0">
				<code className="min-w-0 flex-1 break-all rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground">
					{callbackUrl}
				</code>
				<CopyButton
					text={callbackUrl}
					aria-label="Copy Autumn callback URL"
					className="shrink-0"
				>
					Copy
				</CopyButton>
			</div>
		) : (
			<p className="text-xs text-tertiary-foreground" aria-live="polite">
				Your callback URL isn't available right now. Refresh this page before
				configuring your identity provider.
			</p>
		)}
	</div>
);
