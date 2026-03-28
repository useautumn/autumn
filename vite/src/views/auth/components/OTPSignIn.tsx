import { differenceInSeconds } from "date-fns";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const OTPSignIn = ({
	email,
	newPath,
	callbackPath,
}: {
	email: string;
	newPath: string;
	callbackPath: string;
}) => {
	const [otp, setOtp] = useState("");
	const [resending, setResending] = useState(false);
	const [resendCountdown, setResendCountdown] = useState(0);
	const [verifying, setVerifying] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		if (resendCountdown > 0) {
			setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
		}
	}, [resendCountdown]);

	const handleSubmit = async (otp: string) => {
		setVerifying(true);

		try {
			const { data, error } = await authClient.signIn.emailOtp({
				email: email,
				otp: otp,
			});

			if (error) {
				toast.error(error.message || "Failed to verify code");
				setVerifying(false);
				return;
			}

			const user = data.user;

			console.log("Data:", data);

			// Ensure we're comparing UTC timestamps

			const userCreatedAtUTC = new Date(user.createdAt);
			const nowUTC = new Date();
			const diffSeconds = differenceInSeconds(nowUTC, userCreatedAtUTC);

			const createdRecently = diffSeconds < 20;

			if (createdRecently) {
				window.location.href = newPath;
			} else {
				window.location.href = callbackPath;
			}
		} catch {
			toast.error("Failed to verify code");
		}
		console.log("OTP verified");
		setVerifying(false);
	};

	const handleResend = async () => {
		setResending(true);
		try {
			const { data, error } = await authClient.emailOtp.sendVerificationOtp({
				email: email,
				type: "sign-in",
			});

			console.log(data);
			console.log(error);

			if (error) {
				toast.error(error.message);
				return;
			}

			setResendCountdown(30);
		} catch (error) {
			toast.error("Failed to resend code");
			return;
		}

		setResending(false);
	};

	return (
		<div className="text-center flex flex-col items-center justify-center gap-6">
			<p className="text-sm text-muted-foreground">
				Check your email for the 6 digit code
			</p>
			<div className={cn(verifying && "opacity-50 pointer-events-none")}>
				<InputOTP
					maxLength={6}
					value={otp}
					onChange={setOtp}
					onComplete={handleSubmit}
					disabled={verifying}
				>
					<InputOTPGroup>
						<InputOTPSlot index={0} />
						<InputOTPSlot index={1} />
						<InputOTPSlot index={2} />
					</InputOTPGroup>
					<InputOTPSeparator />
					<InputOTPGroup>
						<InputOTPSlot index={3} />
						<InputOTPSlot index={4} />
						<InputOTPSlot index={5} />
					</InputOTPGroup>
				</InputOTP>
			</div>

			<div className="flex flex-col items-center justify-center gap-2">
				<Button
					variant="link"
					className="text-sm hover:underline text-primary"
					onClick={handleResend}
					shimmer={resending}
					disabled={resending || resendCountdown > 0}
				>
					Didn't receive the code? Resend{" "}
					{resendCountdown > 0 && `(${resendCountdown})`}
				</Button>
			</div>
		</div>
	);
};
