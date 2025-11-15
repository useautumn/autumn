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
			<div className={cn("flex text-t2 text-xs gap-1 px-3 w-full")}>
				<IconButton
					variant="secondary"
					size="sm"
					icon={<ArrowRightIcon />}
					iconOrientation={expanded ? "right" : "center"}
					onClick={() => setShowDeployDialog(true)}
					className={cn(
						"w-full overflow-hidden",
						expanded ? "justify-between" : "justify-center pl-3!",
					)}
				>
					<span
						className={cn(
							"transition-all duration-200",
							expanded
								? "opacity-100 translate-x-0"
								: "opacity-0 -translate-x-2 pointer-events-none w-0 m-0 p-0",
						)}
					>
						Deploy to Production
					</span>
				</IconButton>
			</div>

			<DeployToProdDialog
				open={showDeployDialog}
				onOpenChange={setShowDeployDialog}
			/>
		</>
	);
};
