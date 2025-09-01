import { type ProductItem, UsageModel } from "@autumn/shared";
import { EllipsisVertical } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useProductItemContext } from "./ProductItemContext";

export default function MoreMenuButton({
	show,
	setShow,
}: {
	show: any;
	setShow: (show: any) => void;
}) {
	const [showPopover, setShowPopover] = useState(false);
	const {
		item,
		setItem,
	}: { item: ProductItem; setItem: (item: ProductItem) => void } =
		useProductItemContext();

	return (
		<Popover open={showPopover} onOpenChange={setShowPopover}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="text-t3 text-xs bg-transparent border-none shadow-none justify-start"
					onClick={() => setShowPopover(!showPopover)}
				>
					<EllipsisVertical size={14} className="" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-fit min-w-48 p-0 py-1 flex flex-col text-xs"
				align="end"
			>
				<div className="flex items-center space-x-2">
					<Button
						variant="secondary"
						className="text-xs text-t2 shadow-none border-none w-full justify-start"
						onClick={() => {
							setItem({
								...item,
								reset_usage_when_enabled: !item.reset_usage_when_enabled,
							});
						}}
					>
						<Checkbox
							className="border-t3 mr-1"
							checked={item.reset_usage_when_enabled || false}
						/>
						Reset usage when product is enabled
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

export const MoreMenuPriceButton = () => {
	const [showPopover, setShowPopover] = useState(false);
	const { item, setItem } = useProductItemContext();

	return (
		<Popover open={showPopover} onOpenChange={setShowPopover}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="text-t3 text-xs bg-transparent border-none shadow-none justify-start"
					onClick={() => setShowPopover(!showPopover)}
				>
					<EllipsisVertical size={14} className="" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-48 p-0 flex flex-col text-xs" align="end">
				<div className="flex items-center space-x-2">
					<Button
						variant="secondary"
						className="text-xs text-t2 shadow-none border-none w-full justify-start"
						onClick={() => {
							setItem({
								...item,
								usage_model:
									item.usage_model === UsageModel.Prepaid
										? UsageModel.PayPerUse
										: UsageModel.Prepaid,
							});
						}}
					>
						<Checkbox
							className="border-t3 mr-1"
							checked={item.usage_model === UsageModel.Prepaid}
						/>
						Usage is Prepaid
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};
