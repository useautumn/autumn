import { CopyButton } from "@autumn/ui";
import { maskClientId } from "@/lib/sso/ssoForm";
import type { SsoConnection } from "@/lib/sso/ssoTypes";

const DetailRow = ({
	label,
	value,
	copyText,
	mono = true,
}: {
	label: string;
	value: React.ReactNode;
	copyText?: string;
	mono?: boolean;
}) => (
	<div className="flex items-start gap-3 py-1.5 last:pb-0">
		<span className="w-32 shrink-0 text-sm text-tertiary-foreground">
			{label}
		</span>
		<div className="flex min-w-0 flex-1 items-center gap-2">
			<span
				className={
					mono
						? "min-w-0 break-all font-mono text-xs text-foreground"
						: "min-w-0 break-all text-sm text-foreground"
				}
			>
				{value}
			</span>
			{copyText && (
				<CopyButton
					text={copyText}
					aria-label={`Copy ${label.toLowerCase()}`}
					className="shrink-0"
				>
					Copy
				</CopyButton>
			)}
		</div>
	</div>
);

/** Domain / issuer / masked client ID / Autumn callback URL. Never the secret. */
export const SsoConnectionSummary = ({
	connection,
	callbackUrl,
}: {
	connection: SsoConnection;
	/** Falls back to the org-level setup callback URL. */
	callbackUrl: string | null;
}) => {
	const resolvedCallbackUrl = connection.callbackUrl || callbackUrl;

	return (
		<div className="flex flex-col divide-y divide-border/60">
			<DetailRow
				label="Company domain"
				value={connection.domain}
				mono={false}
			/>
			<DetailRow label="Issuer URL" value={connection.issuer} />
			<DetailRow
				label="Client ID"
				value={maskClientId(connection.clientIdLastFour)}
			/>
			{resolvedCallbackUrl && (
				<DetailRow
					label="Callback URL"
					value={resolvedCallbackUrl}
					copyText={resolvedCallbackUrl}
				/>
			)}
		</div>
	);
};
