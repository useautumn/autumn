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
import { OTPSignIn } from "./components/OTPSignIn";
import { TwoFactorGate } from "./components/TwoFactorGate";

type TwoFactorMethod = "totp" | "otp";

/**
 * Check if URL has OAuth parameters (from OAuth provider redirect)
 * These params are added by better-auth when redirecting unauthenticated users
 */
function getOAuthRedirectUrl(searchParams: URLSearchParams): string | null {
	// Check for OAuth-specific params that indicate this is an OAuth flow
	const clientId = searchParams.get("client_id");
	const responseType = searchParams.get("response_type");
	const redirectUri = searchParams.get("redirect_uri");

	if (clientId && responseType && redirectUri) {
		// Reconstruct the OAuth authorize URL with all params
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
	const [twoFactorMethods, setTwoFactorMethods] = useState<
		TwoFactorMethod[] | null
	>(null);

	const { data: session } = useSession();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	// Check if this is an OAuth flow - if so, redirect back to authorize endpoint after login
	const oauthRedirectUrl = useMemo(
		() => getOAuthRedirectUrl(searchParams),
		[searchParams],
	);

	const defaultNewPath = "/sandbox/products?tab=products";
	const defaultCallbackPath = "/sandbox/products?tab=products";

	// Use OAuth redirect URL if present, otherwise use default paths
	const newPath = oauthRedirectUrl || defaultNewPath;
	const callbackPath = oauthRedirectUrl || defaultCallbackPath;

	useEffect(() => {
		// If this is an OAuth flow and user is already logged in, continue the OAuth flow
		if (oauthRedirectUrl) {
			// Don't auto-redirect to dashboard - let the OAuth flow continue
			// The user will be redirected to consent page after they click sign-in
			return;
		}

		// Regular sign-in flow - redirect to dashboard if already authenticated
		if (session) {
			navigate("/", { replace: true });
		}
	}, [session, navigate, oauthRedirectUrl]);

	// Preload passkeys via WebAuthn conditional mediation so the browser
	// can show a native passkey picker as soon as the email field is focused.
	useEffect(() => {
		if (otpSent || twoFactorMethods || session) return;
		if (typeof window === "undefined") return;
		if (
			typeof window.PublicKeyCredential === "undefined" ||
			!window.PublicKeyCredential.isConditionalMediationAvailable
		) {
			return;
		}
		let cancelled = false;
		window.PublicKeyCredential.isConditionalMediationAvailable()
			.then((available) => {
				if (cancelled || !available) return;
				void authClient.signIn.passkey({
					autoFill: true,
					fetchOptions: {
						onSuccess: () => {
							window.location.href = callbackPath;
						},
					},
				});
			})
			.catch(() => {
				/* ignore — passkey autofill is best-effort */
			});
		return () => {
			cancelled = true;
		};
	}, [otpSent, twoFactorMethods, session, callbackPath]);

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
				toast.error(error.message || "Something went wrong. Please try again.");
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

			// For OAuth flow, we need to redirect back to continue the flow
			// For regular sign-in, use the default dashboard paths
			const googleCallbackUrl =
				oauthRedirectUrl || `${frontendUrl}${defaultCallbackPath}`;
			const googleNewUserUrl =
				oauthRedirectUrl || `${frontendUrl}${defaultNewPath}`;

			const { data, error } = await signIn.social({
				provider: "google",
				callbackURL: googleCallbackUrl,
				newUserCallbackURL: googleNewUserUrl,
			});
			if (error) {
				toast.error(error.message || "Failed to sign in with Google");
				return;
			}
			if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
				const methods =
					(data as { twoFactorMethods?: TwoFactorMethod[] }).twoFactorMethods ??
					(["totp"] as TwoFactorMethod[]);
				setTwoFactorMethods(methods);
			}
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to sign in with Google"));
		} finally {
			setTimeout(() => {
				setGoogleLoading(false);
			}, 1000);
		}
	};

	return (
		<div className="w-screen h-screen bg-background flex items-center justify-center p-4">
			<CustomToaster />
			<div className="w-full max-w-[350px] space-y-4">
				{/* Logo */}
				<div className="flex justify-center">
					<img src="/logo_hd.png" alt="Autumn" className="w-12 h-12" />
				</div>

				{/* Title */}
				<div className="text-center">
					<h1 className="text-lg font-semibold text-foreground">
						Welcome to Autumn
					</h1>
				</div>

				{twoFactorMethods && (
					<TwoFactorGate
						methods={twoFactorMethods}
						newPath={newPath}
						callbackPath={callbackPath}
					/>
				)}

				{!twoFactorMethods && otpSent && (
					<OTPSignIn
						email={email}
						newPath={newPath}
						callbackPath={callbackPath}
						onTwoFactorRequired={setTwoFactorMethods}
					/>
				)}

				{!twoFactorMethods && !otpSent && (
					<div className="space-y-6">
						{/* Google Sign In Button */}
						<IconButton
							variant="primary"
							onClick={handleGoogleSignIn}
							isLoading={googleLoading}
							icon={<FontAwesomeIcon icon={faGoogle} />}
							className={"w-full gap-2"}
						>
							{" "}
							Continue with Google
						</IconButton>

						{/* Divider */}
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
								placeholder="Email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										handleEmailSignIn(e);
									}
								}}
								required
								className="text-base !w-full"
								autoComplete="email webauthn"
							/>

							{/* Sign In Button */}
							<IconButton
								type="submit"
								variant="secondary"
								isLoading={sendOtpLoading}
								onClick={handleEmailSignIn}
								className={"gap-2 w-full"}
								icon={<Mail size={14} className="text-t4" />}
							>
								Continue with Email
							</IconButton>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
