import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod/v4";
import { CustomToaster } from "@/components/general/CustomToaster";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { Input } from "@/components/v2/inputs/Input";
import { useOrg } from "@/hooks/common/useOrg";
import { authClient, signIn } from "@/lib/auth-client";
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

	const newPath = "/sandbox/products?tab=products";
	const callbackPath = "/sandbox/products?tab=products";

	useEffect(() => {
		if (org) {
			if (org.deployed) {
				navigate("/products?tab=products");
			} else {
				navigate("/sandbox/products?tab=products");
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
								autoComplete="email"
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
