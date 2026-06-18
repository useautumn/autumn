import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Mail } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { CustomToaster } from "@/components/general/CustomToaster";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { Input } from "@/components/v2/inputs/Input";
import { authClient, signIn, useSession } from "@/lib/auth-client";
import { getBackendErr } from "@/utils/genUtils";
import { AuthBackground } from "./components/AuthBackground";
import { AutumnWordmark } from "./components/AutumnWordmark";
import { OTPSignIn } from "./components/OTPSignIn";

/**
 * Check if URL has OAuth parameters (from OAuth provider redirect)
 * These params are added by better-auth when redirecting unauthenticated users
 */
function getOAuthRedirectUrl(searchParams: URLSearchParams): string | null {
	const clientId = searchParams.get("client_id");
	const responseType = searchParams.get("response_type");
	const redirectUri = searchParams.get("redirect_uri");
	if (clientId && responseType && redirectUri) {
		const backendUrl = import.meta.env.VITE_BACKEND_URL;
		return `${backendUrl}/api/auth/oauth2/authorize?${searchParams.toString()}`;
	}
	return null;
}

export const emailRegex = /^[^@]+@[^@]+\.[^@]+$/;

export const SignIn = () => {
	const [email, setEmail] = useState("");
	const [googleLoading, setGoogleLoading] = useState(false);
	const [sendOtpLoading, setSendOtpLoading] = useState(false);
	const [otpSent, setOtpSent] = useState(false);

	const { data: session } = useSession();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	const oauthRedirectUrl = useMemo(
		() => getOAuthRedirectUrl(searchParams),
		[searchParams],
	);

	const defaultNewPath = "/";
	const defaultCallbackPath = "/";

	const newPath = oauthRedirectUrl || defaultNewPath;
	const callbackPath = oauthRedirectUrl || defaultCallbackPath;

	useEffect(() => {
		if (oauthRedirectUrl) return;
		if (session) {
			navigate("/", { replace: true });
		}
	}, [session, navigate, oauthRedirectUrl]);

	// Passkey Conditional UI: browsers surface saved passkeys directly in the
	// email field's autocomplete dropdown (no extra button needed). Requires
	// the `webauthn` token in autoComplete and `autoFill: true` on signIn.
	// Skipped during OAuth flows since the post-auth redirect would be lost.
	useEffect(() => {
		if (oauthRedirectUrl || session) return;
		if (typeof window === "undefined") return;
		// Some browsers (notably Firefox) don't support Conditional UI; signIn
		// gracefully no-ops in that case. We still call it on supported browsers.
		const controller = new AbortController();
		(async () => {
			try {
				await authClient.signIn.passkey({
					autoFill: true,
					fetchOptions: { signal: controller.signal },
				});
			} catch {
				// Aborts, cancels, and unsupported-browser errors are non-fatal.
			}
		})();
		return () => {
			controller.abort();
		};
	}, [oauthRedirectUrl, session]);

	const handleEmailSignIn = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email || !emailRegex.test(email)) {
			toast.error("Please enter a valid email address.");
			return;
		}
		setSendOtpLoading(true);
		try {
			const { error } = await authClient.emailOtp.sendVerificationOtp({
				email: email,
				type: "sign-in",
			});
			if (error) {
				toast.error(
					error.message || "Something went wrong. Please try again.",
				);
			} else {
				setOtpSent(true);
			}
		} catch {
			toast.error("Something went wrong. Please try again.");
		} finally {
			setSendOtpLoading(false);
		}
	};

	const handleGoogleSignIn = async () => {
		setGoogleLoading(true);
		try {
			const frontendUrl = import.meta.env.VITE_FRONTEND_URL;
			const googleCallbackUrl =
				oauthRedirectUrl || `${frontendUrl}${defaultCallbackPath}`;
			const googleNewUserUrl =
				oauthRedirectUrl || `${frontendUrl}${defaultNewPath}`;
			const { error } = await signIn.social({
				provider: "google",
				callbackURL: googleCallbackUrl,
				newUserCallbackURL: googleNewUserUrl,
			});
			if (error) {
				toast.error(error.message || "Failed to sign in with Google");
			}
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to sign in with Google"));
		} finally {
			setTimeout(() => setGoogleLoading(false), 1000);
		}
	};

	return (
		<AuthBackground>
			<CustomToaster />
			<div className="flex flex-col items-center gap-6">
				{/* Wordmark logo + welcome text */}
				<div className="flex flex-col items-center gap-3">
					<AutumnWordmark className="h-7 w-auto text-foreground" />
					<p className="text-sm text-muted-foreground">
						Welcome to Autumn, sign in to continue
					</p>
				</div>

				{otpSent ? (
					<OTPSignIn
						email={email}
						newPath={newPath}
						callbackPath={callbackPath}
					/>
				) : (
					<div className="w-full space-y-5">
						<IconButton
							variant="primary"
							onClick={handleGoogleSignIn}
							isLoading={googleLoading}
							icon={<FontAwesomeIcon icon={faGoogle} />}
							className="w-full gap-2"
						>
							Continue with Google
						</IconButton>

						<div className="relative">
							<div className="absolute inset-0 flex items-center">
								<span className="w-full border-t border-border" />
							</div>
							<div className="relative flex justify-center text-xs uppercase">
								<span className="bg-background px-2 text-muted-foreground">
									Or
								</span>
							</div>
						</div>

						<div className="flex flex-col gap-2 w-full">
							<Input
								type="email"
								placeholder="Email or passkey"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleEmailSignIn(e);
								}}
								required
								className="text-base !w-full"
								// "webauthn" token activates Passkey Conditional UI on
								// Chromium/Safari — saved passkeys appear in the input's
								// autofill dropdown.
								autoComplete="username webauthn"
							/>
							<IconButton
								type="submit"
								variant="secondary"
								isLoading={sendOtpLoading}
								onClick={handleEmailSignIn}
								className="gap-2 w-full"
								icon={<Mail size={14} className="text-subtle" />}
							>
								Continue with Email
							</IconButton>
						</div>
					</div>
				)}
			</div>
		</AuthBackground>
	);
};
