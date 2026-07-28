import { CopyButton, FormLabel } from "@autumn/ui";

/**
 * The callback URL is available before a connection exists, so admins can
 * register it with their identity provider first and only then come back with
 * the client credentials it issues.
 */
export const SsoCallbackUrlField = ({
	callbackUrl,
	description = "Your provider won't issue client credentials until this is registered as the redirect URL.",
}: {
	callbackUrl: string | null;
	description?: string;
}) => (
	<div className="flex flex-col">
		<FormLabel>
			<span className="text-muted-foreground">Autumn callback URL</span>
		</FormLabel>
		{callbackUrl ? (
			<div className="flex items-center gap-2 min-w-0">
				<code className="min-w-0 flex-1 break-all rounded-md border bg-interactive-secondary px-2 py-1.5 font-mono text-xs text-foreground">
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
		{callbackUrl && (
			<p className="mt-1 text-xs text-tertiary-foreground">{description}</p>
		)}
	</div>
);
