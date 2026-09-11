import { Button, IconButton } from "@autumn/ui";
import { Check } from "lucide-react";
import { SectionHeader } from "@/views/onboarding3/components/integration-step/SectionHeader";
import { useCopyPlansToProd } from "./useDeployActions";

export const Step2CopyProducts = () => {
	const { isCopied, isCopying, copyPlans } = useCopyPlansToProd();

	return (
		<div className="flex gap-3">
			<div className="flex items-center gap-2">
				<SectionHeader
					stepNumber={2}
					title="Copy your plans to production"
					description="Sync all your configured plans and features from sandbox to production"
					className="gap-0 flex-1"
				/>
			</div>

			<div className="pl-[32px] flex gap-2">
				{isCopied ? (
					<IconButton
						variant="secondary"
						disabled
						icon={<Check size={16} className="text-green-600" />}
						className="!opacity-100"
					>
						Copied Plans
					</IconButton>
				) : (
					<div>
						<Button
							variant="secondary"
							onClick={copyPlans}
							isLoading={isCopying}
							className="w-36"
						>
							Copy Plans to Prod
						</Button>
					</div>
				)}
			</div>
		</div>
	);
};
