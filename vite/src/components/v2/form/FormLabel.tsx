import { cn } from "@/lib/utils";

export const FormLabel = ({
	children,
	disabled,
}: {
	children: React.ReactNode;
	disabled?: boolean;
}) => {
	return (
		<div className={cn("text-form-label block mb-1", disabled && "opacity-50")}>
			{children}
		</div>
	);
};
