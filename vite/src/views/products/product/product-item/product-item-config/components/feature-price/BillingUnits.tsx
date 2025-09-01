import { type Feature, getFeatureName } from "@autumn/shared";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { useProductItemContext } from "../../../ProductItemContext";

export const BillingUnits = ({
	className,
	disabled,
}: {
	className?: string;
	disabled: boolean;
}) => {
	const { features } = useProductContext();
	const { item, setItem } = useProductItemContext();
	const [popoverOpen, setPopoverOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const featureName = getFeatureName({
		feature: features.find((f: Feature) => f.id === item.feature_id),
		plural: item.billing_units > 1,
	});

	const [inputValue, setInputValue] = useState(item.billing_units);

	const handleEnterClick = () => {
		let num = Number(inputValue);
		if (Number.isNaN(num) || num <= 0) {
			num = 1;
		}
		setItem({ ...item, billing_units: num });
		setPopoverOpen(false);
	};

	return (
		<div className={cn("flex max-w-28 min-w-28", className)}>
			<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
				<PopoverTrigger asChild>
					<Button
						ref={triggerRef}
						size="sm"
						variant="ghost"
						disabled={disabled}
						className="w-fit max-w-32 text-t3 overflow-hidden hover:bg-transparent justify-start p-1
            [&:focus]:outline-none [&:focus-visible]:outline-none [&:focus]:ring-0 [&:focus-visible]:ring-0"
					>
						<span
							className={cn(
								"truncate",
								!disabled && "border-b border-dotted border-t3",
							)}
						>
							{item.billing_units === 1
								? `per ${featureName ?? "units"}`
								: `per ${item.billing_units || ""} ${featureName}`}
						</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="max-w-40 p-1" align="start">
					<Input
						type="number"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						placeholder={`eg. 100 ${featureName}`}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								if (popoverOpen) {
									handleEnterClick();
								}
							}
						}}
						onBlur={handleEnterClick}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);

	// return (
	//   <>
	//     {editBillingUnits ? (
	//       <>
	//         <span className="text-t3 text-xs">per</span>
	//         <div
	//           className="w-full max-w-32 flex items-center relative"
	//           onBlur={() => setEditBillingUnits(false)}
	//         >
	//           <Input
	//             autoFocus
	//             value={item.billing_units}
	//             className="pr-9 !text-xs"
	//             type="number"
	//             onChange={(e) =>
	//               setItem({
	//                 ...item,
	//                 billing_units: e.target.value,
	//               })
	//             }
	//           />
	//           <span
	//             className="absolute right-2 top-1/2 -translate-y-1/2 text-t3 text-[10px]
	//           whitespace-nowrap truncate overflow-hidden max-w-16"
	//           >
	//             {featureName ?? "units"}
	//           </span>
	//         </div>
	//       </>
	//     ) : (
	//       <div className="flex w-fit">
	//         <Button
	//           size="sm"
	//           variant="ghost"
	//           disabled={disabled}
	//           className="w-fit max-w-32 text-t3 overflow-hidden hover:bg-transparent justify-start"
	//           onClick={() => setEditBillingUnits(true)}
	//         >
	//           <span
	//             className={cn(
	//               "truncate",
	//               !disabled && "border-b border-dotted border-t3",
	//             )}
	//           >
	//             {item.billing_units == 1
	//               ? `per ${featureName ?? "units"}`
	//               : `per ${item.billing_units || ""} ${featureName ?? "units"}`}
	//           </span>
	//         </Button>
	//       </div>
	//     )}
	//   </>
	// );
};
