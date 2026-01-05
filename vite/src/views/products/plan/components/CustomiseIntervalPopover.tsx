import { Infinite, type ProductItem } from "@autumn/shared";
import { useState } from "react";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";

export const CustomiseIntervalPopover = ({
	item,
	setItem,
}: {
	item: ProductItem;
	setItem: (item: ProductItem) => void;
}) => {
	const [open, setOpen] = useState(false);
	const [intervalCount, setIntervalCount] = useState<number | string>(
		item.interval_count || 1,
	);

	const handleSave = () => {
		setItem({
			...item,
			interval_count: parseInt(intervalCount.toString()),
		});
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					className="w-full justify-start px-2 group-hover:text-primary active:border-0"
					variant="skeleton"
					disabled={item.included_usage === Infinite || item.interval == null}
				>
					<p className="text-t3 group-hover/btn:text-primary">
						Customize Interval
					</p>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="p-3 w-[200px] z-101"
				sideOffset={-1}
				onOpenAutoFocus={(e) => e.preventDefault()}
				onCloseAutoFocus={(e) => e.preventDefault()}
			>
				<div className="mb-2">
					<FieldLabel>Interval Count</FieldLabel>
				</div>
				<div className="flex items-center gap-2">
					<Input
						className="flex-1"
						value={intervalCount}
						onChange={(e) => setIntervalCount(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "-" || e.key === "Minus") {
								e.preventDefault();
							}
							if (e.key === "Enter") {
								handleSave();
							}
							if (e.key === "Escape") {
								setOpen(false);
							}
						}}
					/>
					<Button variant="secondary" className="px-4 h-7" onClick={handleSave}>
						Save
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};
