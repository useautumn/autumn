import { Button } from "@autumn/ui";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useSession } from "@/lib/auth-client";
import {
	clearPendingSsoProviderId,
	describeSsoCallbackError,
	getPendingSsoProviderId,
	parseSsoCallbackQuery,
	resolveCallbackProviderId,
} from "@/lib/sso/ssoCallback";
import { setSsoHint } from "@/lib/sso/ssoHint";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { AuthBackground } from "./components/AuthBackground";
import { AutumnWordmark } from "./components/AutumnWordmark";

/**
 * Landing route for a successful OIDC callback. The server verifies the session
 * and (for an owner/admin test login) flips the connection to active; we only
 * persist the presentation hint it hands back.
 */
export const SsoCallback = () => {
	const { search } = useLocation();
	const searchParams = parseSsoCallbackQuery(search);
	const { data: session, isPending: sessionLoading } = useSession();
	const axiosInstance = useAxiosInstance();
	const navigate = useNavigate();
	const startedRef = useRef(false);
	const [error, setError] = useState<string | null>(null);

	// The provider round trip reports failure as a redirect param, not an
	// exception, so this is the only place the real reason surfaces.
	const providerError = searchParams.get("error");
	const providerErrorDescription = searchParams.get("error_description");
	const queryProviderId = searchParams.get("providerId");

	useEffect(() => {
		if (startedRef.current || sessionLoading || providerError) return;

		if (!session) {
			setError(
				"Your single sign-on session didn't complete. Please sign in again.",
			);
			return;
		}

		const providerId = resolveCallbackProviderId({
			queryProviderId,
			rememberedProviderId: getPendingSsoProviderId(),
		});

		if (!providerId) {
			setError(
				"This callback is missing its SSO provider. Start the test sign-in again from Settings → Single sign-on.",
			);
			return;
		}

		startedRef.current = true;

		(async () => {
			try {
				const { data } = await OrgService.completeSso(axiosInstance, {
					providerId,
				});
				setSsoHint(data.hint);
				clearPendingSsoProviderId();
				navigate(data.activated ? "/settings?tab=sso" : "/", { replace: true });
			} catch (err) {
				startedRef.current = false;
				setError(
					getBackendErr(err, "We couldn't finish your single sign-on setup."),
				);
			}
		})();
	}, [
		axiosInstance,
		navigate,
		providerError,
		queryProviderId,
		session,
		sessionLoading,
	]);

	const displayedError = providerError
		? describeSsoCallbackError({
				error: providerError,
				description: providerErrorDescription,
			})
		: error;

	return (
		<AuthBackground>
			<div className="flex flex-col items-center gap-6 text-center">
				<AutumnWordmark className="h-7 w-auto text-foreground" />
				{displayedError ? (
					<div className="flex flex-col items-center gap-4">
						<p role="alert" className="text-sm text-muted-foreground">
							{displayedError}
						</p>
						<Button
							variant="secondary"
							onClick={() => navigate("/sign-in", { replace: true })}
						>
							Back to sign in
						</Button>
					</div>
				) : (
					<p
						aria-busy="true"
						aria-live="polite"
						className="animate-pulse text-sm text-muted-foreground"
					>
						Finishing single sign-on…
					</p>
				)}
			</div>
		</AuthBackground>
	);
};
