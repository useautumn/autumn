import { ArrowLeftIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";

interface ExitButtonProps {
	position?: "fixed" | "absolute";
}

export function ExitButton({ position = "absolute" }: ExitButtonProps) {
	const navigate = useNavigate();
	const env = useEnv();

	return (
		<div className={`${position} top-4 left-4 z-10`}>
			<Tooltip>
				<TooltipTrigger asChild>
					<IconButton
						variant="skeleton"
						size="sm"
						onClick={() => navigateTo("/products", navigate, env)}
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
