import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	FormLabel,
	Input,
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@autumn/ui";
import { Mail } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type ChangeEmailStep = "input" | "verify";

/**
 * Account-profile form. Name updates via `authClient.updateUser`; the email
 * field gets its own OTP-gated change flow via the email-OTP plugin
 * (`request-email-change` → `change-email`).
 *
 * The user.email update does NOT touch the Google OAuth `account` row —
 * better-auth's OAuth lookup goes through (providerId, accountId), so a
 * Google sign-in still resolves to the same user even after rename.
 */
export const UserDetails = () => {
	const { data: session, refetch } = useSession();
	const user = session?.user;

	const [name, setName] = useState(user?.name || "");
	const [saving, setSaving] = useState(false);
	const [changeEmailOpen, setChangeEmailOpen] = useState(false);

	const canSave = useMemo(() => {
		return name !== user?.name && name.trim() !== "";
	}, [name, user?.name]);

	const handleSave = async () => {
		try {
			setSaving(true);
			const { error } = await authClient.updateUser({
				name: name.trim(),
			});
			if (error) {
				toast.error(error.message || "Failed to update profile");
				return;
			}
			await refetch();
			toast.success("Successfully updated profile");
		} catch (error) {
			console.error(error);
			toast.error("Failed to update profile");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="w-full flex flex-col gap-4">
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div className="flex flex-col">
					<FormLabel>
						<span className="text-muted-foreground">Name</span>
					</FormLabel>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Your name"
					/>
				</div>
				<div className="flex flex-col">
					<FormLabel>
						<span className="text-muted-foreground">Email</span>
					</FormLabel>
					<div className="flex items-center gap-2">
						<Input
							value={user?.email || ""}
							disabled
							className="text-tertiary-foreground flex-1"
						/>
						<Button
							variant="secondary"
							onClick={() => setChangeEmailOpen(true)}
							className="gap-2 shrink-0"
						>
							<Mail size={14} />
							Change
						</Button>
					</div>
				</div>
			</div>
			<div>
				<Button
					variant="primary"
					disabled={!canSave}
					onClick={handleSave}
					isLoading={saving}
					className="min-w-20"
				>
					Save
				</Button>
			</div>

			<ChangeEmailDialog
				open={changeEmailOpen}
				onOpenChange={setChangeEmailOpen}
				currentEmail={user?.email ?? ""}
				onChanged={async () => {
					await refetch();
				}}
			/>
		</div>
	);
};

const ChangeEmailDialog = ({
	open,
	onOpenChange,
	currentEmail,
	onChanged,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentEmail: string;
	onChanged: () => Promise<void>;
}) => {
	const [step, setStep] = useState<ChangeEmailStep>("input");
	const [newEmail, setNewEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [requesting, setRequesting] = useState(false);
	const [verifying, setVerifying] = useState(false);
	const [resending, setResending] = useState(false);
	const [resendCountdown, setResendCountdown] = useState(0);

	useEffect(() => {
		if (!open) {
			// Defer reset so the close transition doesn't flash the input
			// step before the dialog fades out.
			const t = setTimeout(() => {
				setStep("input");
				setNewEmail("");
				setOtp("");
				setRequesting(false);
				setVerifying(false);
				setResending(false);
				setResendCountdown(0);
			}, 150);
			return () => clearTimeout(t);
		}
	}, [open]);

	useEffect(() => {
		if (resendCountdown <= 0) return;
		const t = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
		return () => clearTimeout(t);
	}, [resendCountdown]);

	const handleRequest = async () => {
		const trimmed = newEmail.trim().toLowerCase();
		if (!emailRegex.test(trimmed)) {
			toast.error("Enter a valid email address");
			return;
		}
		if (trimmed === currentEmail.toLowerCase()) {
			toast.error("That's already your current email");
			return;
		}
		setRequesting(true);
		try {
			const { error } = await authClient.emailOtp.requestEmailChange({
				newEmail: trimmed,
			});
			if (error) {
				toast.error(error.message || "Failed to send verification code");
				return;
			}
			setStep("verify");
			setResendCountdown(30);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to send verification code",
			);
		} finally {
			setRequesting(false);
		}
	};

	const handleVerify = async (otpValue: string) => {
		const trimmed = newEmail.trim().toLowerCase();
		setVerifying(true);
		try {
			const { error } = await authClient.emailOtp.changeEmail({
				newEmail: trimmed,
				otp: otpValue,
			});
			if (error) {
				toast.error(error.message || "Failed to verify code");
				setOtp("");
				return;
			}
			toast.success(`Email updated to ${trimmed}`);
			await onChanged();
			onOpenChange(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to verify code");
			setOtp("");
		} finally {
			setVerifying(false);
		}
	};

	const handleResend = async () => {
		const trimmed = newEmail.trim().toLowerCase();
		if (!trimmed) return;
		setResending(true);
		try {
			const { error } = await authClient.emailOtp.requestEmailChange({
				newEmail: trimmed,
			});
			if (error) {
				toast.error(error.message || "Failed to resend code");
				return;
			}
			setResendCountdown(30);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to resend code");
		} finally {
			setResending(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-md bg-card">
				<DialogHeader>
					<DialogTitle>
						{step === "input" ? "Change email" : "Verify your new email"}
					</DialogTitle>
					<DialogDescription>
						{step === "input" ? (
							<>
								We'll send a verification code to the new address. Your Google
								sign-in stays linked to the same account.
							</>
						) : (
							<>
								We sent a 6-digit code to{" "}
								<span className="font-medium text-foreground">
									{newEmail.trim().toLowerCase()}
								</span>
								. Enter it to confirm the change.
							</>
						)}
					</DialogDescription>
				</DialogHeader>

				{step === "input" ? (
					<div className="flex flex-col gap-3">
						<FormLabel>
							<span className="text-muted-foreground">New email</span>
						</FormLabel>
						<Input
							autoFocus
							type="email"
							value={newEmail}
							onChange={(e) => setNewEmail(e.target.value)}
							placeholder="you@example.com"
							onKeyDown={(e) => {
								if (e.key === "Enter") handleRequest();
							}}
						/>
					</div>
				) : (
					<div className="flex flex-col items-center justify-center gap-4 py-2">
						<div className={cn(verifying && "shimmer")}>
							<InputOTP
								autoFocus
								maxLength={6}
								value={otp}
								onChange={setOtp}
								onComplete={handleVerify}
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
						<Button
							variant="skeleton"
							onClick={handleResend}
							disabled={resending || resendCountdown > 0}
							className={cn(
								"text-xs underline-offset-4 hover:underline text-primary",
								resending && "shimmer",
							)}
						>
							Didn't get it? Resend
							{resendCountdown > 0 ? ` (${resendCountdown})` : ""}
						</Button>
					</div>
				)}

				<DialogFooter>
					<Button
						variant="muted"
						onClick={() => onOpenChange(false)}
						disabled={requesting || verifying}
					>
						Cancel
					</Button>
					{step === "input" ? (
						<Button
							variant="primary"
							onClick={handleRequest}
							isLoading={requesting}
							disabled={!newEmail.trim()}
						>
							Send code
						</Button>
					) : (
						<Button
							variant="primary"
							onClick={() => handleVerify(otp)}
							isLoading={verifying}
							disabled={otp.length !== 6}
						>
							Verify & update
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
