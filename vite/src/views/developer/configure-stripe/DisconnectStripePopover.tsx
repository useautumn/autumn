import { useState } from "react";
import { toast } from "sonner";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const DisconnectStripePopover = ({
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
	const [confirmText, setConfirmText] = useState("");
	const axiosInstance = useAxiosInstance();

	const [disconnecting, setDisconnecting] = useState(false);

	const disconnectStripe = async () => {
		await OrgService.disconnectStripe(axiosInstance, channel);
	};
	const handleDeleteClicked = async () => {
		if (confirmText !== "disconnect") {
			toast.error("Please type 'disconnect' to confirm");
			return;
		}

		setDisconnecting(true);
		try {
			await disconnectStripe();
			await onSuccess();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to disconnect Stripe"));
		}

		setDisconnecting(false);
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="secondary" className="gap-1.5">
					{icon}
					{label}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start">
				<div className="flex flex-col gap-4 text-sm w-fit">
					<p className="text-tertiary-foreground">
						Are you sure you want to disconnect your Stripe account?
					</p>
					<Input
						placeholder={`Type "disconnect" to confirm`}
						value={confirmText}
						onChange={(e) => setConfirmText(e.target.value)}
					/>
					<Button
						variant="destructive"
						className="w-fit"
						isLoading={disconnecting}
						onClick={handleDeleteClicked}
					>
						Confirm
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};
