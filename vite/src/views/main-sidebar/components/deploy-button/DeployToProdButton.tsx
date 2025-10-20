import { ArrowRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { cn } from "@/lib/utils";
import { DeployToProdDialog } from "./DeployToProdDialog";

interface DeployToProdButtonProps {
	expanded: boolean;
}

export const DeployToProdButton = ({ expanded }: DeployToProdButtonProps) => {
	const [showDeployDialog, setShowDeployDialog] = useState(false);

	return (
		<>
			<div className={cn("flex text-t2 text-xs gap-1 pl-3")}>
				{expanded && (
					<IconButton
						variant="primary"
						size="sm"
						icon={<ArrowRightIcon />}
						iconOrientation="right"
						onClick={() => setShowDeployDialog(true)}
						className="w-fit"
					>
						Go to Production
					</IconButton>
				)}
			</div>

			<DeployToProdDialog
				open={showDeployDialog}
				onOpenChange={setShowDeployDialog}
			/>
		</>
	);
};
