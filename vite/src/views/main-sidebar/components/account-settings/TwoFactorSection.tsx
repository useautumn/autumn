import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
import { authClient, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { getBackendErr } from "@/utils/genUtils";

type EnableState =
	| { step: "password" }
	| { step: "verify"; totpURI: string; backupCodes: string[] }
	| { step: "done" };

const EnableDialog = ({
	open,
	setOpen,
	onEnabled,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	onEnabled: () => void;
}) => {
	const [password, setPassword] = useState("");
	const [state, setState] = useState<EnableState>({ step: "password" });
	const [otp, setOtp] = useState("");
	const [loading, setLoading] = useState(false);
	const [verifying, setVerifying] = useState(false);

	const reset = () => {
		setPassword("");
		setOtp("");
		setState({ step: "password" });
		setLoading(false);
		setVerifying(false);
	};

	const handleEnable = async () => {
		setLoading(true);
		try {
			const { data, error } = await authClient.twoFactor.enable({
				password: password || "",
			});
			if (error) {
				toast.error(error.message || "Failed to enable 2FA");
				return;
			}
			if (!data) {
				toast.error("Failed to enable 2FA");
				return;
			}
			setState({
				step: "verify",
				totpURI: data.totpURI,
				backupCodes: data.backupCodes,
			});
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to enable 2FA"));
		} finally {
			setLoading(false);
		}
	};

	const handleVerify = async (code: string) => {
		setVerifying(true);
		try {
			const { error } = await authClient.twoFactor.verifyTotp({ code });
			if (error) {
				toast.error(error.message || "Invalid code");
				setOtp("");
				return;
			}
			toast.success("Two-factor authentication enabled");
			onEnabled();
			setOpen(false);
			setTimeout(reset, 300);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to verify code"));
			setOtp("");
		} finally {
			setVerifying(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setTimeout(reset, 300);
			}}
		>
			<DialogContent className="max-w-[440px]">
				<DialogHeader>
					<DialogTitle>Enable two-factor authentication</DialogTitle>
					<DialogDescription>
						{state.step === "password"
							? "Confirm your password to generate a TOTP secret and backup codes."
							: "Scan the URI with your authenticator app, then enter the 6-digit code to finish."}
					</DialogDescription>
				</DialogHeader>

				{state.step === "password" && (
					<div className="flex flex-col gap-3 py-2">
						<Input
							type="password"
							placeholder="Current password (leave blank if you don't have one)"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							autoComplete="current-password"
						/>
					</div>
				)}

				{state.step === "verify" && (
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-2">
							<p className="text-xs text-t3">
								Scan or paste this URI into your authenticator app:
							</p>
							<div className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
								<code className="text-xs text-t2 break-all flex-1 font-mono">
									{state.totpURI}
								</code>
								<CopyButton text={state.totpURI} />
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<p className="text-xs text-t3">
								Save these backup codes in a safe place. Each can be used once.
							</p>
							<div className="grid grid-cols-2 gap-1 bg-muted/50 rounded-md p-2 font-mono text-xs text-t2">
								{state.backupCodes.map((code) => (
									<span key={code}>{code}</span>
								))}
							</div>
							<CopyButton
								text={state.backupCodes.join("\n")}
								className="self-start"
							>
								Copy all codes
							</CopyButton>
						</div>

						<div className="flex flex-col items-center gap-2 pt-1">
							<p className="text-xs text-t3">Enter your first 6-digit code</p>
							<div className={cn(verifying && "shimmer")}>
								<InputOTP
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
						</div>
					</div>
				)}

				<DialogFooter>
					{state.step === "password" && (
						<>
							<Button variant="secondary" onClick={() => setOpen(false)}>
								Cancel
							</Button>
							<Button
								variant="primary"
								onClick={handleEnable}
								isLoading={loading}
							>
								Continue
							</Button>
						</>
					)}
					{state.step === "verify" && (
						<Button variant="secondary" onClick={() => setOpen(false)}>
							Close
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

const DisableDialog = ({
	open,
	setOpen,
	onDisabled,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	onDisabled: () => void;
}) => {
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const handleDisable = async () => {
		setLoading(true);
		try {
			const { error } = await authClient.twoFactor.disable({
				password: password || "",
			});
			if (error) {
				toast.error(error.message || "Failed to disable 2FA");
				return;
			}
			toast.success("Two-factor authentication disabled");
			onDisabled();
			setOpen(false);
			setPassword("");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to disable 2FA"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setPassword("");
			}}
		>
			<DialogContent className="max-w-[420px]">
				<DialogHeader>
					<DialogTitle>Disable two-factor authentication</DialogTitle>
					<DialogDescription>
						Your account will no longer require a second factor. Confirm your
						password to continue.
					</DialogDescription>
				</DialogHeader>
				<Input
					type="password"
					placeholder="Current password (leave blank if you don't have one)"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					autoComplete="current-password"
				/>
				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleDisable}
						isLoading={loading}
					>
						Disable 2FA
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export const TwoFactorSection = () => {
	const { data: session, refetch } = useSession();
	const enabled = Boolean(
		(session?.user as { twoFactorEnabled?: boolean } | undefined)
			?.twoFactorEnabled,
	);

	const [enableOpen, setEnableOpen] = useState(false);
	const [disableOpen, setDisableOpen] = useState(false);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<h3 className="text-sm font-medium text-t1">
					Two-Factor Authentication
				</h3>
				<p className="text-xs text-t3">
					Add an extra layer of security with an authenticator app.
				</p>
			</div>

			<div className="border border-border rounded-xl bg-card px-4 py-3 flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<ShieldCheck
						className={cn(
							"w-5 h-5 shrink-0",
							enabled ? "text-green-500" : "text-t4",
						)}
					/>
					<div className="flex flex-col">
						<span className="text-sm text-t1">
							{enabled ? "2FA is enabled" : "2FA is not enabled"}
						</span>
						<span className="text-xs text-t3">
							{enabled
								? "You'll be prompted for a code when signing in."
								: "Protect sign-ins with a TOTP authenticator app."}
						</span>
					</div>
				</div>
				{enabled ? (
					<Button
						variant="secondary"
						onClick={() => setDisableOpen(true)}
						className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30"
					>
						Disable
					</Button>
				) : (
					<Button variant="primary" onClick={() => setEnableOpen(true)}>
						Enable 2FA
					</Button>
				)}
			</div>

			<EnableDialog
				open={enableOpen}
				setOpen={setEnableOpen}
				onEnabled={() => {
					void refetch();
				}}
			/>
			<DisableDialog
				open={disableOpen}
				setOpen={setDisableOpen}
				onDisabled={() => {
					void refetch();
				}}
			/>
		</div>
	);
};
