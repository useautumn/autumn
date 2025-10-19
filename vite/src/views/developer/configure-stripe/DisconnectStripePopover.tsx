import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const DisconnectStripePopover = ({
	onSuccess,
}: {
	onSuccess: () => Promise<void>;
}) => {
	const [confirmText, setConfirmText] = useState("");
	const axiosInstance = useAxiosInstance();

	const [disconnecting, setDisconnecting] = useState(false);

	const disconnectStripe = async () => {
		await OrgService.disconnectStripe(axiosInstance);
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
				<Button variant="destructive">Disconnect Stripe</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="border border-zinc-200">
				<div className="flex flex-col gap-4 text-sm w-fit">
					<p className="text-t3">
						Are you sure you want to disconnect your Stripe account?
					</p>
					<Input
						variant="destructive"
						placeholder={`Type "disconnect" to confirm`}
						value={confirmText}
						onChange={(e) => setConfirmText(e.target.value)}
					/>
					<Button
						variant="outline"
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
