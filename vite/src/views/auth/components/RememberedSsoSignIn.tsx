import { IconButton } from "@autumn/ui";
import { LockKeyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { isSafeSsoRedirectUrl } from "@/lib/sso/ssoCallback";
import { clearSsoHint } from "@/lib/sso/ssoHint";
import { resolveSso } from "@/lib/sso/ssoResolve";
import type { SsoOrgHint } from "@/lib/sso/ssoTypes";

const linkClassName =
	"text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-primary cursor-pointer";

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
	const [searchParams] = useSearchParams();
	const next = searchParams.get("next") ?? undefined;

	const handleContinue = async () => {
		setIsLoading(true);
		try {
			const result = await resolveSso({ providerId: hint.providerId, next });
			if (result.action === "sso" && isSafeSsoRedirectUrl(result.url)) {
				window.location.assign(result.url);
				return;
			}
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
				Continue with {hint.organizationName}&apos;s SSO
			</IconButton>

			<div className="flex flex-row items-center justify-center gap-1">
				<button
					type="button"
					className={linkClassName}
					onClick={() => {
						clearSsoHint();
						onForget();
					}}
					disabled={isLoading}
				>
					Forget this organization
				</button>
				<span className="text-muted-foreground select-none">・</span>
				<button
					type="button"
					className={linkClassName}
					onClick={onUseAnotherEmail}
					disabled={isLoading}
				>
					Try another email
				</button>
			</div>
		</div>
	);
};
