import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Input,
} from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

const CONFIRM_TEXT = "disconnect";

const CHANNEL_LABEL: Record<"secret_key" | "oauth", string> = {
	secret_key: "secret key",
	oauth: "OAuth",
};

export const DisconnectStripeDialog = ({
	onSuccess,
	channel,
	label = "Disconnect Stripe",
	icon,
}: {
	onSuccess: () => Promise<void>;
	channel?: "secret_key" | "oauth";
	label?: string;
	icon?: React.ReactNode;
}) => {
	const axiosInstance = useAxiosInstance();
	const [open, setOpen] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const [disconnecting, setDisconnecting] = useState(false);

	const canConfirm = confirmText === CONFIRM_TEXT && !disconnecting;
	const channelLabel = channel ? CHANNEL_LABEL[channel] : null;

	const handleConfirm = async () => {
		if (!canConfirm) {
			return;
		}

		setDisconnecting(true);
		try {
			await OrgService.disconnectStripe(axiosInstance, channel);
			await onSuccess();
			setOpen(false);
			setConfirmText("");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to disconnect Stripe"));
		}

		setDisconnecting(false);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					setConfirmText("");
				}
			}}
		>
			<DialogTrigger asChild>
				<Button variant="secondary" className="w-full gap-1.5">
					{icon}
					{label}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						Disconnect {channelLabel ? `${channelLabel} ` : ""}from Stripe
					</DialogTitle>
					<DialogDescription>
						Type{" "}
						<span className="font-medium text-foreground">{CONFIRM_TEXT}</span>{" "}
						to confirm. This stops Autumn from using
						{channelLabel ? ` this ${channelLabel}` : " this connection"} for
						Stripe operations.
					</DialogDescription>
				</DialogHeader>

				<Input
					autoFocus
					value={confirmText}
					onChange={(e) => setConfirmText(e.target.value)}
					onKeyDown={(e) => {
						if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
							handleConfirm();
						}
					}}
					placeholder={`Type "${CONFIRM_TEXT}" to confirm`}
				/>

				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						disabled={!canConfirm}
						isLoading={disconnecting}
						onClick={handleConfirm}
					>
						Disconnect
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
