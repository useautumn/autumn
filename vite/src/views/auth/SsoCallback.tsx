import { Button, SmallSpinner } from "@autumn/ui";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useSession } from "@/lib/auth-client";
import {
	clearPendingSsoProviderId,
	getPendingSsoProviderId,
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
	const [searchParams] = useSearchParams();
	const { data: session, isPending: sessionLoading } = useSession();
	const axiosInstance = useAxiosInstance();
	const navigate = useNavigate();
	const startedRef = useRef(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (startedRef.current || sessionLoading) return;

		if (!session) {
			setError(
				"Your single sign-on session didn't complete. Please sign in again.",
			);
			return;
		}

		const providerId = resolveCallbackProviderId({
			queryProviderId: searchParams.get("providerId"),
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
	}, [axiosInstance, navigate, searchParams, session, sessionLoading]);

	return (
		<AuthBackground>
			<div className="flex flex-col items-center gap-6 text-center">
				<AutumnWordmark className="h-7 w-auto text-foreground" />
				{error ? (
					<div className="flex flex-col items-center gap-4">
						<p role="alert" className="text-sm text-muted-foreground">
							{error}
						</p>
						<Button
							variant="secondary"
							onClick={() => navigate("/sign-in", { replace: true })}
						>
							Back to sign in
						</Button>
					</div>
				) : (
					<div
						className="flex flex-col items-center gap-3"
						aria-live="polite"
						aria-busy="true"
					>
						<SmallSpinner className="text-tertiary-foreground" />
						<p className="text-sm text-muted-foreground">
							Finishing single sign-on…
						</p>
					</div>
				)}
			</div>
		</AuthBackground>
	);
};
