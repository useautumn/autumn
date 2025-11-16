import { CusProductStatus } from "@autumn/shared";
import { ExclamationMarkIcon, XIcon } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { BanIcon, CalendarIcon, CheckIcon, ClockIcon } from "lucide-react";

const StatusItem = ({
	children,
	text,
	trial_ends_at,
}: {
	children: React.ReactNode;
	text: string;
	trial_ends_at?: number;
}) => {
	return (
		<div className="flex items-center gap-1.5 text-t3">
			{children}
			<span className="text-sm">{text}</span>
			{trial_ends_at && (
				<span className="text-sm">({formatDistanceToNow(trial_ends_at)})</span>
			)}
		</div>
	);
};

export const CustomerProductsStatus = ({
	status,
	canceled,
	trialing,
	trial_ends_at,
}: {
	status?: CusProductStatus;
	canceled?: boolean;
	trialing?: boolean;
	trial_ends_at?: number;
}) => {
	// If product is canceled, show that status regardless of other status
	if (canceled) {
		return (
			<StatusItem text="Cancelling">
				<BanIcon
					className="text-white bg-orange-500 dark:bg-orange-600 rounded-full p-0.5"
					size={12}
				/>
			</StatusItem>
		);
	}

	if (trialing) {
		return (
			<StatusItem text="Trial" trial_ends_at={trial_ends_at}>
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
				<StatusItem text="Active">
					<CheckIcon
						className="text-white bg-green-500 dark:bg-green-600 rounded-full p-0.5"
						size={12}
					/>
				</StatusItem>
			);
		case CusProductStatus.PastDue:
			return (
				<StatusItem text="Past Due">
					<ExclamationMarkIcon
						className="text-white bg-red-500 dark:bg-red-600 rounded-full p-0.5"
						size={12}
					/>
				</StatusItem>
			);

		case CusProductStatus.Trialing:
			return (
				<StatusItem text="Trial">
					<ClockIcon
						className="text-white bg-blue-500 dark:bg-blue-600 rounded-full m-0.5"
						size={12}
					/>
				</StatusItem>
			);

		case CusProductStatus.Scheduled:
			return (
				<StatusItem text="Scheduled">
					<CalendarIcon
						className="text-white bg-purple-500 dark:bg-purple-600 rounded-full p-0.5"
						size={12}
					/>
				</StatusItem>
			);

		case CusProductStatus.Expired:
			return (
				<StatusItem text="Expired">
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
