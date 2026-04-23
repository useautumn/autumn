import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	ShieldCheck,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { Input } from "@/components/v2/inputs/Input";
import { authClient, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { getBackendErr } from "@/utils/genUtils";

type Mode =
	| { kind: "idle" }
	| { kind: "enabling-password" }
	| { kind: "enabling-verify"; totpURI: string; backupCodes: string[] }
	| { kind: "enabling-backup-codes"; backupCodes: string[] }
	| { kind: "disabling" };

const PanelShell = ({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) => (
	<div
		className={cn(
			"border border-border rounded-xl bg-card p-4 flex flex-col gap-4",
			className,
		)}
	>
		{children}
	</div>
);

const PanelHeader = ({
	title,
	description,
	icon,
	iconClassName,
}: {
	title: string;
	description?: string;
	icon?: React.ReactNode;
	iconClassName?: string;
}) => (
	<div className="flex items-start gap-3">
		{icon && (
			<div className={cn("shrink-0 mt-0.5", iconClassName)}>{icon}</div>
		)}
		<div className="flex flex-col gap-0.5 min-w-0">
			<h4 className="text-sm font-medium text-t1">{title}</h4>
			{description && <p className="text-xs text-t3">{description}</p>}
		</div>
	</div>
);

const IdlePanel = ({
	enabled,
	onEnable,
	onDisable,
}: {
	enabled: boolean;
	onEnable: () => void;
	onDisable: () => void;
}) => (
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
				onClick={onDisable}
				className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30"
			>
				Disable
			</Button>
		) : (
			<Button variant="primary" onClick={onEnable}>
				Enable 2FA
			</Button>
		)}
	</div>
);

const PasswordPanel = ({
	onCancel,
	onSuccess,
}: {
	onCancel: () => void;
	onSuccess: (data: { totpURI: string; backupCodes: string[] }) => void;
}) => {
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const handleContinue = async () => {
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
			onSuccess({
				totpURI: data.totpURI,
				backupCodes: data.backupCodes,
			});
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to enable 2FA"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<PanelShell>
			<PanelHeader
				title="Enable two-factor authentication"
				description="Confirm your password to generate a TOTP secret and backup codes."
			/>
			<Input
				type="password"
				placeholder="Current password (leave blank if you don't have one)"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
				autoComplete="current-password"
				onKeyDown={(e) => {
					if (e.key === "Enter" && !loading) void handleContinue();
				}}
			/>
			<div className="flex justify-end gap-2">
				<Button variant="secondary" onClick={onCancel} disabled={loading}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={handleContinue}
					isLoading={loading}
				>
					Continue
				</Button>
			</div>
		</PanelShell>
	);
};

const VerifyPanel = ({
	totpURI,
	backupCodes,
	onCancel,
	onVerified,
}: {
	totpURI: string;
	backupCodes: string[];
	onCancel: () => void;
	onVerified: (codes: string[]) => void;
}) => {
	const [otp, setOtp] = useState("");
	const [verifying, setVerifying] = useState(false);
	const [showSetupKey, setShowSetupKey] = useState(false);
	const [cancelling, setCancelling] = useState(false);

	const handleVerify = async (code: string) => {
		setVerifying(true);
		try {
			const { error } = await authClient.twoFactor.verifyTotp({ code });
			if (error) {
				toast.error(error.message || "Invalid code");
				setOtp("");
				return;
			}
			onVerified(backupCodes);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to verify code"));
			setOtp("");
		} finally {
			setVerifying(false);
		}
	};

	const handleCancel = async () => {
		// 2FA is provisioned server-side but not yet verified. Roll it back so
		// the session doesn't end up in a half-enabled state.
		setCancelling(true);
		try {
			await authClient.twoFactor.disable({ password: "" });
		} catch {
			// best-effort cleanup
		} finally {
			setCancelling(false);
			onCancel();
		}
	};

	return (
		<PanelShell>
			<PanelHeader
				title="Scan with your authenticator"
				description="Open your authenticator app (1Password, Authy, Google Authenticator, etc.) and scan the code."
			/>

			<div className="flex flex-col items-center gap-3 w-full min-w-0">
				<div className="shrink-0 rounded-lg bg-white p-3 border border-border">
					<QRCodeSVG
						value={totpURI}
						size={176}
						level="M"
						bgColor="#ffffff"
						fgColor="#000000"
					/>
				</div>

				<button
					type="button"
					onClick={() => setShowSetupKey((v) => !v)}
					className="flex items-center gap-1 text-xs text-t3 hover:text-t2"
				>
					{showSetupKey ? (
						<ChevronUp className="w-3.5 h-3.5" />
					) : (
						<ChevronDown className="w-3.5 h-3.5" />
					)}
					{showSetupKey ? "Hide setup key" : "Can't scan? Show setup key"}
				</button>

				{showSetupKey && (
					<div className="flex flex-col gap-2 bg-muted/50 rounded-md p-3 min-w-0 w-full">
						<p className="text-xs text-t3">
							Paste this into your authenticator app:
						</p>
						<code className="text-xs text-t2 font-mono break-all whitespace-normal leading-relaxed">
							{totpURI}
						</code>
						<CopyButton text={totpURI} className="self-start">
							Copy setup key
						</CopyButton>
					</div>
				)}
			</div>

			<div className="flex flex-col items-center gap-2 pt-1">
				<p className="text-xs text-t3">
					Enter the 6-digit code from your authenticator
				</p>
				<div className={cn(verifying && "shimmer")}>
					<InputOTP
						maxLength={6}
						value={otp}
						onChange={setOtp}
						onComplete={handleVerify}
						disabled={verifying}
						autoFocus
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

			<div className="flex justify-end gap-2">
				<Button
					variant="secondary"
					onClick={handleCancel}
					isLoading={cancelling}
					disabled={verifying}
				>
					Cancel
				</Button>
			</div>
		</PanelShell>
	);
};

const BackupCodesPanel = ({
	backupCodes,
	onDone,
}: {
	backupCodes: string[];
	onDone: () => void;
}) => {
	const [acknowledged, setAcknowledged] = useState(false);

	const handleDownload = () => {
		const blob = new Blob(
			[
				`Autumn two-factor backup codes\nGenerated: ${new Date().toISOString()}\n\n${backupCodes.join("\n")}\n\nEach code can only be used once.`,
			],
			{ type: "text/plain" },
		);
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "autumn-backup-codes.txt";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	return (
		<PanelShell>
			<PanelHeader
				title="Two-factor authentication enabled"
				description="Save these backup codes now. You'll need one if you ever lose access to your authenticator."
				icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
			/>

			<div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200">
				<AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
				<p className="text-xs">
					Each backup code can only be used once. Store them in a password
					manager or somewhere safe. You won't be able to see them again.
				</p>
			</div>

			<div className="grid grid-cols-2 gap-x-6 gap-y-1 bg-muted/50 rounded-md p-4 font-mono text-xs text-t2">
				{backupCodes.map((code) => (
					<span key={code}>{code}</span>
				))}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<CopyButton text={backupCodes.join("\n")}>Copy all codes</CopyButton>
				<Button variant="secondary" size="sm" onClick={handleDownload}>
					Download as .txt
				</Button>
			</div>

			<label className="flex items-center gap-2 text-xs text-t2 cursor-pointer select-none">
				<Checkbox
					checked={acknowledged}
					onCheckedChange={(v) => setAcknowledged(v === true)}
				/>
				I've saved my backup codes somewhere safe
			</label>

			<div className="flex justify-end">
				<Button
					variant="primary"
					onClick={onDone}
					disabled={!acknowledged}
				>
					Done
				</Button>
			</div>
		</PanelShell>
	);
};

const DisablePanel = ({
	onCancel,
	onDisabled,
}: {
	onCancel: () => void;
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
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to disable 2FA"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<PanelShell>
			<PanelHeader
				title="Disable two-factor authentication"
				description="Your account will no longer require a second factor to sign in. Confirm your password to continue."
				icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
			/>
			<Input
				type="password"
				placeholder="Current password (leave blank if you don't have one)"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
				autoComplete="current-password"
				onKeyDown={(e) => {
					if (e.key === "Enter" && !loading) void handleDisable();
				}}
			/>
			<div className="flex justify-end gap-2">
				<Button variant="secondary" onClick={onCancel} disabled={loading}>
					Cancel
				</Button>
				<Button
					variant="destructive"
					onClick={handleDisable}
					isLoading={loading}
				>
					Disable 2FA
				</Button>
			</div>
		</PanelShell>
	);
};

export const TwoFactorSection = () => {
	const { data: session, refetch } = useSession();
	const enabled = Boolean(
		(session?.user as { twoFactorEnabled?: boolean } | undefined)
			?.twoFactorEnabled,
	);

	const [mode, setMode] = useState<Mode>({ kind: "idle" });

	const goIdle = () => setMode({ kind: "idle" });

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

			{mode.kind === "idle" && (
				<IdlePanel
					enabled={enabled}
					onEnable={() => setMode({ kind: "enabling-password" })}
					onDisable={() => setMode({ kind: "disabling" })}
				/>
			)}

			{mode.kind === "enabling-password" && (
				<PasswordPanel
					onCancel={goIdle}
					onSuccess={({ totpURI, backupCodes }) =>
						setMode({ kind: "enabling-verify", totpURI, backupCodes })
					}
				/>
			)}

			{mode.kind === "enabling-verify" && (
				<VerifyPanel
					totpURI={mode.totpURI}
					backupCodes={mode.backupCodes}
					onCancel={() => {
						void refetch();
						goIdle();
					}}
					onVerified={(codes) => {
						void refetch();
						toast.success("Two-factor authentication enabled");
						setMode({ kind: "enabling-backup-codes", backupCodes: codes });
					}}
				/>
			)}

			{mode.kind === "enabling-backup-codes" && (
				<BackupCodesPanel
					backupCodes={mode.backupCodes}
					onDone={goIdle}
				/>
			)}

			{mode.kind === "disabling" && (
				<DisablePanel
					onCancel={goIdle}
					onDisabled={() => {
						void refetch();
						goIdle();
					}}
				/>
			)}
		</div>
	);
};
