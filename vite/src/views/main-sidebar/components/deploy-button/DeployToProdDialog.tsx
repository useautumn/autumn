import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	IconButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { Step1ConnectStripe } from "../../deploy-dialog/Step1ConnectStripe";
import { Step2CopyProducts } from "../../deploy-dialog/Step2CopyProducts";
import { Step3CreateApiKey } from "../../deploy-dialog/Step3CreateApiKey";
import { useGoToProduction } from "../../deploy-dialog/useDeployActions";

interface DeployToProdDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export const DeployToProdDialog = ({
	open,
	onOpenChange,
}: DeployToProdDialogProps) => {
	const { isDeploying, goToProduction } = useGoToProduction();

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
								onClick={goToProduction}
								isLoading={isDeploying}
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
