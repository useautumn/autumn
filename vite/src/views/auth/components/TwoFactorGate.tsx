import { differenceInSeconds } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { getBackendErr } from "@/utils/genUtils";

type TwoFactorMethod = "totp" | "otp";

type Mode = "totp" | "otp" | "backup";

const redirectAfterVerify = ({
	user,
	newPath,
	callbackPath,
}: {
	user: { createdAt?: string | Date } | null | undefined;
	newPath: string;
	callbackPath: string;
}) => {
	if (!user?.createdAt) {
		window.location.href = callbackPath;
		return;
	}
	const userCreatedAtUTC = new Date(user.createdAt);
	const nowUTC = new Date();
	const diffSeconds = differenceInSeconds(nowUTC, userCreatedAtUTC);
	window.location.href = diffSeconds < 20 ? newPath : callbackPath;
};

export const TwoFactorGate = ({
	newPath,
	callbackPath,
	methods,
}: {
	newPath: string;
	callbackPath: string;
	methods: TwoFactorMethod[];
}) => {
	const initialMode: Mode = methods.includes("totp") ? "totp" : "otp";
	const [mode, setMode] = useState<Mode>(initialMode);
	const [otp, setOtp] = useState("");
	const [backupCode, setBackupCode] = useState("");
	const [verifying, setVerifying] = useState(false);
	const [sendingOtp, setSendingOtp] = useState(false);
	const [otpSent, setOtpSent] = useState(false);

	const hasTotp = methods.includes("totp");
	const hasOtp = methods.includes("otp");

	const handleVerifyTotp = async (code: string) => {
		setVerifying(true);
		try {
			const { data, error } = await authClient.twoFactor.verifyTotp({
				code,
				trustDevice: true,
			});
			if (error) {
				toast.error(error.message || "Invalid code");
				setOtp("");
				return;
			}
			redirectAfterVerify({
				user: (data as { user?: { createdAt?: string | Date } } | null)?.user,
				newPath,
				callbackPath,
			});
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to verify code"));
			setOtp("");
		} finally {
			setVerifying(false);
		}
	};

	const handleVerifyOtp = async (code: string) => {
		setVerifying(true);
		try {
			const { data, error } = await authClient.twoFactor.verifyOtp({
				code,
				trustDevice: true,
			});
			if (error) {
				toast.error(error.message || "Invalid code");
				setOtp("");
				return;
			}
			redirectAfterVerify({
				user: (data as { user?: { createdAt?: string | Date } } | null)?.user,
				newPath,
				callbackPath,
			});
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to verify code"));
			setOtp("");
		} finally {
			setVerifying(false);
		}
	};

	const handleSendOtp = async () => {
		setSendingOtp(true);
		try {
			const { error } = await authClient.twoFactor.sendOtp();
			if (error) {
				toast.error(error.message || "Failed to send code");
				return;
			}
			setOtpSent(true);
			toast.success("Verification code sent to your email");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to send code"));
		} finally {
			setSendingOtp(false);
		}
	};

	const handleVerifyBackup = async () => {
		if (!backupCode.trim()) return;
		setVerifying(true);
		try {
			const { data, error } = await authClient.twoFactor.verifyBackupCode({
				code: backupCode.trim(),
				trustDevice: true,
			});
			if (error) {
				toast.error(error.message || "Invalid backup code");
				return;
			}
			redirectAfterVerify({
				user: (data as { user?: { createdAt?: string | Date } } | null)?.user,
				newPath,
				callbackPath,
			});
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to verify backup code"));
		} finally {
			setVerifying(false);
		}
	};

	const subtitle =
		mode === "totp"
			? "Open your authenticator app and enter the 6-digit code"
			: mode === "otp"
				? otpSent
					? "Check your email for the 6-digit code"
					: "Send a verification code to your email"
				: "Enter one of your backup codes";

	return (
		<div className="text-center flex flex-col items-center justify-center gap-6">
			<div className="flex flex-col gap-1">
				<p className="text-sm text-t1 font-medium">Two-factor authentication</p>
				<p className="text-sm text-muted-foreground">{subtitle}</p>
			</div>

			{mode === "totp" && (
				<div className={cn(verifying && "shimmer")}>
					<InputOTP
						maxLength={6}
						value={otp}
						onChange={setOtp}
						onComplete={handleVerifyTotp}
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
			)}

			{mode === "otp" && !otpSent && (
				<Button
					variant="primary"
					onClick={handleSendOtp}
					isLoading={sendingOtp}
				>
					Send verification code
				</Button>
			)}

			{mode === "otp" && otpSent && (
				<div className={cn(verifying && "shimmer")}>
					<InputOTP
						maxLength={6}
						value={otp}
						onChange={setOtp}
						onComplete={handleVerifyOtp}
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
			)}

			{mode === "backup" && (
				<div className="flex flex-col gap-2 w-full">
					<Input
						value={backupCode}
						onChange={(e) => setBackupCode(e.target.value)}
						placeholder="Backup code"
						autoComplete="one-time-code"
						onKeyDown={(e) => {
							if (e.key === "Enter") void handleVerifyBackup();
						}}
					/>
					<Button
						variant="primary"
						onClick={handleVerifyBackup}
						isLoading={verifying}
						disabled={!backupCode.trim()}
						className="w-full"
					>
						Verify backup code
					</Button>
				</div>
			)}

			<div className="flex flex-col items-center gap-1 text-xs">
				{mode !== "totp" && hasTotp && (
					<Button
						variant="skeleton"
						size="sm"
						onClick={() => {
							setMode("totp");
							setOtp("");
						}}
					>
						Use authenticator app instead
					</Button>
				)}
				{mode !== "otp" && hasOtp && (
					<Button
						variant="skeleton"
						size="sm"
						onClick={() => {
							setMode("otp");
							setOtp("");
							setOtpSent(false);
						}}
					>
						Use email code instead
					</Button>
				)}
				{mode !== "backup" && (
					<Button
						variant="skeleton"
						size="sm"
						onClick={() => setMode("backup")}
					>
						Use a backup code
					</Button>
				)}
			</div>
		</div>
	);
};
