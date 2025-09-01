import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
export const PriceItem = ({
	children,
	className,
	...props
}: {
	children: React.ReactNode;
	className?: string;
} & React.HTMLAttributes<HTMLDivElement>) => {
	return (
		<div
			className={cn(
				`flex h-7 flex-col sm:flex-row text-muted-foreground pb-4 sm:pb-0 gap-1 justify-between sm:gap-2 sm:items-center  sm:whitespace-nowrap`,
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
};

export const QuantityInput = ({
	children,
	onChange,
	value,
	className,
	...props
}: {
	children: React.ReactNode;
	value: string | number;
	onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	className?: string;
} & React.HTMLAttributes<HTMLDivElement>) => {
	const currentValue = Number(value) || 0;

	const handleValueChange = (newValue: number) => {
		const syntheticEvent = {
			target: { value: String(newValue) },
		} as React.ChangeEvent<HTMLInputElement>;
		onChange(syntheticEvent);
	};

	return (
		<div className={cn(className, "flex items-center gap-4")} {...props}>
			<div className="flex items-center gap-1">
				<Button
					variant="outline"
					size="icon"
					onClick={() =>
						currentValue > 0 && handleValueChange(currentValue - 1)
					}
					disabled={currentValue <= 0}
					className="h-6 w-6 pb-0.5"
				>
					-
				</Button>
				<span className="w-8 text-center">{currentValue}</span>
				<Button
					variant="outline"
					size="icon"
					onClick={() => handleValueChange(currentValue + 1)}
					className="h-6 w-6 pb-0.5"
				>
					+
				</Button>
			</div>
			{children}
		</div>
	);
};

export const TotalPrice = ({ children }: { children: React.ReactNode }) => {
	return (
		<div className="text-sm w-full mb-4 sm:mb-0 font-medium flex justify-between items-center">
			{children}
		</div>
	);
};
