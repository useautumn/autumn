import { CusProductStatus } from "@autumn/shared";
import { DotIcon, ExclamationMarkIcon, XIcon } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { BanIcon, CalendarIcon, CheckIcon, ClockIcon } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";

const StatusItem = ({
	children,
	text,
	trial_ends_at,
	tooltip,
	className,
}: {
	children: React.ReactNode;
	text: string;
	trial_ends_at?: number;
	tooltip?: boolean;
	className?: string;
}) => {
	return (
		<div className={cn("flex items-center", className)}>
			{tooltip ? (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger>{children}</TooltipTrigger>
						<TooltipContent>
							<span className="text-sm">{text} </span>
							{trial_ends_at && (
								<span className="text-sm text-t3">
									({formatDistanceToNow(trial_ends_at)} left)
								</span>
							)}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			) : (
				<>
					<div className="flex items-center gap-1.5">
						{children}
						<span className="text-sm">{text}</span>
					</div>
					{trial_ends_at && (
						<>
							<DotIcon size={16} />
							<span className="text-sm text-t3">
								{formatDistanceToNow(trial_ends_at)} left
							</span>
						</>
					)}
				</>
			)}
		</div>
	);
};

export const CustomerProductsStatus = ({
	tooltip,
	status,
	canceled,
	trialing,
	trial_ends_at,
}: {
	status?: CusProductStatus;
	tooltip?: boolean;
	canceled?: boolean;
	trialing?: boolean;
	trial_ends_at?: number;
}) => {
	// If product is canceled, show that status regardless of other status
	if (canceled) {
		return (
			<StatusItem text="Cancelling" tooltip={tooltip}>
				<BanIcon
					className="text-white bg-orange-500 dark:bg-orange-600 rounded-full p-0.5"
					size={12}
				/>
			</StatusItem>
		);
	}

	if (trialing) {
		return (
			<StatusItem text="Trial" trial_ends_at={trial_ends_at} tooltip={tooltip}>
				<ClockIcon
					className="text-white bg-blue-500 dark:bg-blue-600 rounded-full p-0.5"
					size={12}
				/>
			</StatusItem>
		);
	}

	switch (status) {
		case CusProductStatus.Active:
			return (
				<StatusItem text="Active" tooltip={tooltip}>
					<CheckIcon
						className="text-white bg-green-500 dark:bg-green-600 rounded-full p-0.5"
						size={12}
					/>
				</StatusItem>
			);
		case CusProductStatus.PastDue:
			return (
				<StatusItem text="Past Due" tooltip={tooltip}>
					<ExclamationMarkIcon
						className="text-white bg-red-500 dark:bg-red-600 rounded-full p-0.5"
						size={12}
					/>
				</StatusItem>
			);

		case CusProductStatus.Trialing:
			return (
				<StatusItem text="Trial" tooltip={tooltip}>
					<ClockIcon
						className="text-white bg-blue-500 dark:bg-blue-600 rounded-full m-0.5"
						size={12}
					/>
				</StatusItem>
			);

		case CusProductStatus.Scheduled:
			return (
				<StatusItem text="Scheduled" tooltip={tooltip}>
					<CalendarIcon
						className="text-white bg-purple-500 dark:bg-purple-600 rounded-full p-0.5"
						size={12}
					/>
				</StatusItem>
			);

		case CusProductStatus.Expired:
			return (
				<StatusItem text="Expired" tooltip={tooltip}>
					<XIcon
						className="text-white bg-black dark:bg-black rounded-full p-0.5"
						size={12}
					/>
				</StatusItem>
			);
		default:
			return <div>Unknown</div>;
	}
};
