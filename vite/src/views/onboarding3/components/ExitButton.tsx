import { ArrowLeftIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { pushPage } from "@/utils/genUtils";
import { useOnboarding3QueryState } from "../hooks/useOnboarding3QueryState";
import { OnboardingStep } from "../utils/onboardingUtils";

interface ExitButtonProps {
	position?: "fixed" | "absolute";
}

export function ExitButton({ position = "absolute" }: ExitButtonProps) {
	const navigate = useNavigate();
	const { org, mutate: mutateOrg } = useOrg();
	const axiosInstance = useAxiosInstance();
	const { queryStates } = useOnboarding3QueryState();
	const step = queryStates.step;

	// Hide exit button on integration step (step 5)
	if (step === OnboardingStep.Integration) {
		return null;
	}

	const handleExit = async () => {
		if (!org?.onboarded) {
			await axiosInstance.patch("/v1/organization", {
				onboarded: true,
			});
			await mutateOrg();
		}

		pushPage({
			navigate,
			path: "/products",
			queryParams: {
				tab: "products",
			},
			preserveParams: true,
		});
	};

	return (
		<div className={`${position} top-4 left-4 z-10`}>
			<Tooltip>
				<TooltipTrigger asChild>
					<IconButton
						variant="skeleton"
						size="sm"
						onClick={handleExit}
						icon={<ArrowLeftIcon className="size-4" />}
					>
						Exit to Dashboard
					</IconButton>
				</TooltipTrigger>
				<TooltipContent className="ml-5">
					<span className="text-sm block whitespace-pre-line max-w-48">
						You can come back at any time by clicking in the top right
						corner&apos;s &quot;Onboarding&quot; button.
					</span>
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
