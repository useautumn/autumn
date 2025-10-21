import { ArrowRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { Step1ConnectStripe } from "../../deploy-dialog/Step1ConnectStripe";
import { Step2CopyProducts } from "../../deploy-dialog/Step2CopyProducts";
import { Step3CreateApiKey } from "../../deploy-dialog/Step3CreateApiKey";

interface DeployToProdDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export const DeployToProdDialog = ({
	open,
	onOpenChange,
}: DeployToProdDialogProps) => {
	const [loading, setLoading] = useState(false);
	const axiosInstance = useAxiosInstance();
	const { mutate: mutateOrg } = useOrg();
	const navigate = useNavigate();

	const handleGoToProduction = async () => {
		setLoading(true);
		try {
			await axiosInstance.patch("/v1/organization", {
				deployed: true,
			});

			await mutateOrg();

			window.location.href = "/products?tab=products";
		} catch (error) {
			console.error("Failed to deploy to production:", error);
		} finally {
			setLoading(false);
		}
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>Deploy to Production</DialogTitle>
					<DialogDescription>
						Follow the steps below to deploy Autumn to production.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-10 mt-4 [>&_.atmn-sep]:ml-[32px]">
					<Step1ConnectStripe isDialogOpen={open} />
					<Step2CopyProducts />
					<Step3CreateApiKey />
				</div>

				<DialogFooter>
					<Tooltip>
						<TooltipTrigger>
							<IconButton
								variant="primary"
								icon={<ArrowRightIcon />}
								iconOrientation="right"
								onClick={handleGoToProduction}
								isLoading={loading}
							>
								Go to Production
							</IconButton>
						</TooltipTrigger>
						<TooltipContent side="bottom" className="max-w-xs">
							Make sure you've completed all the steps above before clicking
							this button. You won't be able to see this dialog again after
							doing so.
						</TooltipContent>
					</Tooltip>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
