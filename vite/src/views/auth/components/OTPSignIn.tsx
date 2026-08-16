import {
	Button,
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@autumn/ui";
import { differenceInSeconds } from "date-fns";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
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
		setVerifying(false);
	};

	const handleResend = async () => {
		setResending(true);
		try {
			const { error } = await authClient.emailOtp.sendVerificationOtp({
				email: email,
				type: "sign-in",
			});
			if (error) {
				toast.error(error.message);
				return;
			}
			setResendCountdown(30);
		} catch {
			toast.error("Failed to resend code");
			return;
		}
		setResending(false);
	};

	return (
		<div className="text-center flex flex-col items-center justify-center gap-5">
			<p className="text-sm text-muted-foreground">
				We sent a 6-digit code to{" "}
				<span className="font-medium text-foreground">{email}</span>
			</p>

			<div className={cn(verifying && "shimmer")}>
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
					variant="skeleton"
					className={cn(
						"text-sm underline-offset-4 hover:underline text-primary",
						resending && "shimmer",
					)}
					onClick={handleResend}
					disabled={resending || resendCountdown > 0}
				>
					Didn't receive the code? Resend{" "}
					{resendCountdown > 0 && `(${resendCountdown})`}
				</Button>
			</div>
		</div>
	);
};
