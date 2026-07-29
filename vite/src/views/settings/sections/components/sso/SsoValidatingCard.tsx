import { Badge, Button, StepBadge } from "@autumn/ui";
import { toast } from "sonner";
import {
	buildSsoCallbackUrl,
	isSafeSsoRedirectUrl,
	rememberPendingSsoProviderId,
} from "@/lib/sso/ssoCallback";
import type { SsoConnection } from "@/lib/sso/ssoTypes";
import { getBackendErr } from "@/utils/genUtils";
import { SsoConnectionSummary } from "./SsoConnectionSummary";
import type { useSsoActions } from "./useSsoActions";

export const SsoValidatingCard = ({
	connection,
	callbackUrl,
	testSignIn,
	onDelete,
}: {
	connection: SsoConnection;
	callbackUrl: string | null;
	testSignIn: ReturnType<typeof useSsoActions>["testSignIn"];
	onDelete: React.ReactNode;
}) => {
	const handleTestSignIn = async () => {
		try {
			const { url } = await testSignIn.mutateAsync();
			if (!isSafeSsoRedirectUrl(url)) {
				toast.error("Received an invalid sign-in URL. Please try again.");
				return;
			}
			// Remembered so the completion route can still finish if the callback
			// lands without a providerId query param.
			rememberPendingSsoProviderId(connection.providerId);
			// Full-page navigation: the provider round trip must come back to the
			// SSO completion route, so the callback can't be swallowed by the router.
			window.location.assign(url);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to start the test sign-in"));
		}
	};

	return (
		<div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
					<StepBadge>3</StepBadge>
					<span className="text-sm font-medium text-foreground">
						{connection.domain}
					</span>
					<Badge variant="muted">Last step: test sign-in</Badge>
				</div>
				<p className="text-sm text-tertiary-foreground">
					Domain verified. One test sign-in left — sign in through your provider
					as an owner or admin, and SSO turns on for everyone at{" "}
					{connection.domain}.
				</p>
			</div>

			<SsoConnectionSummary connection={connection} callbackUrl={callbackUrl} />

			<p className="text-xs text-tertiary-foreground">
				Test sign-in opens your identity provider and returns to{" "}
				<code className="font-mono break-all">
					{buildSsoCallbackUrl(window.location.origin)}
				</code>{" "}
				to finish activation.
			</p>

			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="primary"
					onClick={handleTestSignIn}
					isLoading={testSignIn.isPending}
				>
					Test sign-in
				</Button>
				{onDelete}
			</div>
		</div>
	);
};
