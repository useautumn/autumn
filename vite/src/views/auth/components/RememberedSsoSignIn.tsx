import { Button, IconButton } from "@autumn/ui";
import { LockKeyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { isSafeSsoRedirectUrl } from "@/lib/sso/ssoCallback";
import { clearSsoHint } from "@/lib/sso/ssoHint";
import { resolveSso } from "@/lib/sso/ssoResolve";
import type { SsoOrgHint } from "@/lib/sso/ssoTypes";

/**
 * Shown only when a previous successful SSO sign-in left a hint behind. Nothing
 * happens until the person clicks: the provider is resolved server-side by
 * providerId, and a hint the backend no longer recognises falls back to email.
 */
export const RememberedSsoSignIn = ({
	hint,
	onUseAnotherEmail,
	onForget,
}: {
	hint: SsoOrgHint;
	onUseAnotherEmail: () => void;
	onForget: () => void;
}) => {
	const [isLoading, setIsLoading] = useState(false);

	const handleContinue = async () => {
		setIsLoading(true);
		try {
			const result = await resolveSso({ providerId: hint.providerId });
			if (result.action === "sso" && isSafeSsoRedirectUrl(result.url)) {
				window.location.assign(result.url);
				return;
			}
			// Stale hint: the org no longer resolves to SSO, so drop it and hand
			// the person back to the email flow.
			clearSsoHint();
			onForget();
			toast.error(
				`${hint.organizationName} no longer uses single sign-on here. Continue with your email instead.`,
			);
		} catch {
			toast.error("Couldn't start single sign-on. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="w-full space-y-5">
			<IconButton
				variant="primary"
				onClick={handleContinue}
				isLoading={isLoading}
				icon={<LockKeyIcon weight="fill" />}
				className="w-full gap-2"
			>
				Continue with {hint.organizationName} SSO
			</IconButton>

			<div className="flex flex-col items-center gap-1">
				<Button
					variant="skeleton"
					className="text-sm underline-offset-4 hover:underline text-primary"
					onClick={onUseAnotherEmail}
					disabled={isLoading}
				>
					Use another email
				</Button>
				<Button
					variant="skeleton"
					className="text-sm underline-offset-4 hover:underline text-tertiary-foreground"
					onClick={() => {
						clearSsoHint();
						onForget();
					}}
					disabled={isLoading}
				>
					Forget this organization
				</Button>
			</div>
		</div>
	);
};
