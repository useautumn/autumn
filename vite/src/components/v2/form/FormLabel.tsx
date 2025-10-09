import { cn } from "@/lib/utils";

export const FormLabel = ({
	children,
	disabled,
	className,
}: {
	children: React.ReactNode;
	disabled?: boolean;
	className?: string;
}) => {
	return (
		<div
			className={cn(
				"text-form-label block mb-1",
				disabled && "opacity-50",
				className,
			)}
		>
			{children}
		</div>
	);
};
