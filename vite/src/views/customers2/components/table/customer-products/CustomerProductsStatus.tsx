import { CusProductStatus } from "@autumn/shared";
import { XIcon } from "@phosphor-icons/react";
import { CheckIcon, ClockIcon } from "lucide-react";

const StatusItem = ({
	children,
	text,
}: {
	children: React.ReactNode;
	text: string;
}) => {
	return (
		<div className="flex items-center gap-1.5 text-t3">
			{children}
			<span className="text-sm">{text}</span>
		</div>
	);
};

export const CustomerProductsStatus = ({
	status,
}: {
	status?: CusProductStatus;
}) => {
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
				<StatusItem text="Inactive">
					<XIcon
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

		case CusProductStatus.Expired:
			return (
				<StatusItem text="Expired">
					<XIcon
						className="text-white bg-red-500 dark:bg-red-600 rounded-full p-0.5"
						size={12}
					/>
				</StatusItem>
			);
		default:
			return <div>Unknown</div>;
	}
};
