import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { CustomToaster } from "@/components/general/CustomToaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/hooks/common/useOrg";
import { authClient, signIn } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { getBackendErr } from "@/utils/genUtils";
import { OTPSignIn } from "./components/OTPSignIn";

export const emailSchema = z.email();

export const SignIn = () => {
	const [email, setEmail] = useState("");
	const [googleLoading, setGoogleLoading] = useState(false);
	const [sendOtpLoading, setSendOtpLoading] = useState(false);
	const [otpSent, setOtpSent] = useState(false);

	const { org } = useOrg();
	const navigate = useNavigate();

	const newPath = "/sandbox/onboarding";
	const callbackPath = "/sandbox/products?tab=products";

	useEffect(() => {
		if (org) {
			if (org.deployed) {
				navigate("/products?tab=products");
			} else if (org.onboarded) {
				navigate("/sandbox/products?tab=products");
			} else {
				navigate("/sandbox/onboarding");
			}
		}
	}, [org, navigate]);

	const handleEmailSignIn = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email || !emailSchema.safeParse(email).success) {
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

			const { error } = await signIn.social({
				provider: "google",
				callbackURL: `${frontendUrl}${callbackPath}`,
				newUserCallbackURL: `${frontendUrl}${newPath}`,
			});
			if (error) {
				toast.error(error.message || "Failed to sign in with Google");
			}
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to sign in with Google"));
		} finally {
			setTimeout(() => {
				setGoogleLoading(false);
			}, 1000);
		}
	};

	const height = "h-9";

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

				{otpSent && (
					<OTPSignIn
						email={email}
						newPath={newPath}
						callbackPath={callbackPath}
					/>
				)}

				{!otpSent && (
					<div className="space-y-6">
						{/* Google Sign In Button */}
						<Button
							variant="auth"
							onClick={handleGoogleSignIn}
							isLoading={googleLoading}
							startIcon={
								<FontAwesomeIcon icon={faGoogle} className="text-stone-400" />
							}
							className={height}
						>
							Continue with Google
						</Button>

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

						<div className="space-y-4">
							<div className="space-y-2">
								<Input
									type="email"
									placeholder="Email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
									className="text-base"
									autoComplete="email"
								/>
							</div>

							{/* Sign In Button */}
							<Button
								type="submit"
								variant="auth"
								isLoading={sendOtpLoading}
								onClick={handleEmailSignIn}
								className={cn(height)}
								startIcon={<Mail size={14} className="text-stone-500" />}
							>
								Continue with email
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
