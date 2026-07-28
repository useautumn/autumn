import { Badge, Button, CopyButton } from "@autumn/ui";
import { toast } from "sonner";
import {
	formatCooldown,
	getSsoRetryAfterSeconds,
	isRateLimitError,
} from "@/lib/sso/ssoRateLimit";
import type { SsoConnection } from "@/lib/sso/ssoTypes";
import {
	formatVerificationExpiry,
	isVerificationExpired,
} from "@/lib/sso/ssoVerification";
import { getBackendErr } from "@/utils/genUtils";
import { SsoConnectionSummary } from "./SsoConnectionSummary";
import { useCooldown } from "./useCooldown";
import type { useSsoActions } from "./useSsoActions";

const MANUAL_CHECK_COOLDOWN_SECONDS = 30;

const TxtRecordField = ({ label, value }: { label: string; value: string }) => (
	<div className="flex flex-col gap-1 min-w-0">
		<span className="text-xs font-medium text-tertiary-foreground">
			{label}
		</span>
		<div className="flex items-center gap-2 min-w-0">
			<code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground">
				{value}
			</code>
			<CopyButton
				text={value}
				aria-label={`Copy TXT record ${label.toLowerCase()}`}
				className="shrink-0"
			>
				Copy
			</CopyButton>
		</div>
	</div>
);

export const SsoDomainVerificationCard = ({
	connection,
	callbackUrl,
	verifyDomain,
	onDelete,
}: {
	connection: SsoConnection;
	callbackUrl: string | null;
	verifyDomain: ReturnType<typeof useSsoActions>["verifyDomain"];
	onDelete: React.ReactNode;
}) => {
	const { secondsLeft, startCooldown } = useCooldown();
	const { verification } = connection;
	const expiresLabel = verification
		? formatVerificationExpiry(verification.expiresAt)
		: null;
	const expired = verification
		? isVerificationExpired(verification.expiresAt)
		: false;

	const handleCheck = async () => {
		try {
			const result = await verifyDomain.mutateAsync();
			if (result.connection?.status === "pending_domain_verification") {
				startCooldown(MANUAL_CHECK_COOLDOWN_SECONDS);
				toast.error(
					"We couldn't find the TXT record yet. DNS changes can take a while to propagate.",
				);
				return;
			}
			toast.success("Domain verified");
		} catch (error) {
			const retryAfter = getSsoRetryAfterSeconds(error);
			if (retryAfter !== null) {
				startCooldown(retryAfter);
			} else if (isRateLimitError(error)) {
				startCooldown(MANUAL_CHECK_COOLDOWN_SECONDS);
			}
			toast.error(
				isRateLimitError(error)
					? "Too many verification checks. Please wait before trying again."
					: getBackendErr(error, "Failed to check domain verification"),
			);
		}
	};

	const onCooldown = secondsLeft > 0;

	return (
		<div className="flex flex-col gap-4 rounded-lg border bg-background p-4">
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-foreground">
						Verify {connection.domain}
					</span>
					<Badge variant="muted">Pending domain verification</Badge>
				</div>
				<p className="text-sm text-tertiary-foreground">
					Add this TXT record to your DNS so we know you control the domain.
				</p>
			</div>

			{verification ? (
				<div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
					<TxtRecordField label="Host" value={verification.host} />
					<TxtRecordField label="Value" value={verification.value} />
					<p className="text-xs text-tertiary-foreground">
						DNS propagation usually takes a few minutes but can take up to 24
						hours. Leave the record in place, and use Check verification once it
						has propagated.
						{expiresLabel && (
							<>
								{" "}
								{expired
									? `This record expired on ${expiresLabel}; delete and set up the connection again to get a new one.`
									: `This record is valid until ${expiresLabel}.`}
							</>
						)}
					</p>
				</div>
			) : (
				<p className="text-sm text-tertiary-foreground">
					No DNS record is available for this connection yet. Delete it and set
					SSO up again to generate a new one.
				</p>
			)}

			<SsoConnectionSummary connection={connection} callbackUrl={callbackUrl} />

			<div
				aria-live="polite"
				className="text-xs text-tertiary-foreground min-h-4"
			>
				{onCooldown
					? `You can check again in ${formatCooldown(secondsLeft)}.`
					: ""}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="primary"
					onClick={handleCheck}
					isLoading={verifyDomain.isPending}
					disabled={onCooldown || !verification}
				>
					{onCooldown
						? `Check verification (${formatCooldown(secondsLeft)})`
						: "Check verification"}
				</Button>
				{onDelete}
			</div>
		</div>
	);
};
