import { IconButton, Input } from "@autumn/ui";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import type { FormCustomLineItem } from "@/components/forms/attach-v2/attachFormSchema";

let customLineItemCounter = 0;

export function createCustomLineItem(): FormCustomLineItem {
	return {
		_id: `cli_${Date.now()}_${customLineItemCounter++}`,
		amount: "",
		description: "",
	};
}

export function addCustomLineItem(
	lineItems: FormCustomLineItem[],
): FormCustomLineItem[] {
	return [...lineItems, createCustomLineItem()];
}

export function removeCustomLineItem(
	lineItems: FormCustomLineItem[],
	index: number,
): FormCustomLineItem[] {
	return lineItems.filter((_, i) => i !== index);
}

export function updateCustomLineItem({
	lineItems,
	index,
	field,
	value,
}: {
	lineItems: FormCustomLineItem[];
	index: number;
	field: "amount" | "description";
	value: string;
}): FormCustomLineItem[] {
	const updated = [...lineItems];
	updated[index] =
		field === "amount"
			? { ...updated[index], amount: value === "" ? "" : Number(value) }
			: { ...updated[index], description: value };
	return updated;
}

export function CustomLineItemRows({
	lineItems,
	onAdd,
	onUpdate,
	onRemove,
	hideAddButton = false,
}: {
	lineItems: FormCustomLineItem[];
	onAdd: () => void;
	onUpdate: (params: {
		index: number;
		field: "amount" | "description";
		value: string;
	}) => void;
	onRemove: (params: { index: number }) => void;
	hideAddButton?: boolean;
}) {
	return (
		<div className="flex flex-col gap-2">
			{!hideAddButton && (
				<div className="flex justify-end">
					<IconButton
						className="text-tertiary-foreground"
						icon={<PlusIcon size={12} />}
						onClick={onAdd}
						size="sm"
						variant="muted"
					>
						Add
					</IconButton>
				</div>
			)}
			{lineItems.length > 0 && (
				<div className="space-y-2">
					<AnimatePresence initial={false} mode="popLayout">
						{lineItems.map((lineItem, index) => (
							<motion.div
								key={lineItem._id}
								initial={{ opacity: 0, scale: 0.95 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.95 }}
								transition={{ duration: 0.15 }}
							>
								<div className="flex items-center gap-2">
									<Input
										autoFocus={
											lineItem.description === "" && lineItem.amount === ""
										}
										type="number"
										placeholder="Amount ($)"
										value={lineItem.amount}
										onChange={(e) =>
											onUpdate({
												index,
												field: "amount",
												value: e.target.value,
											})
										}
										className="h-7 text-xs w-24 shrink-0"
									/>
									<Input
										placeholder="Description"
										value={lineItem.description}
										onChange={(e) =>
											onUpdate({
												index,
												field: "description",
												value: e.target.value,
											})
										}
										className="h-7 text-xs flex-1"
									/>
									<IconButton
										variant="muted"
										size="sm"
										onClick={() => onRemove({ index })}
										icon={<XIcon size={12} />}
										className="shrink-0 text-tertiary-foreground hover:text-red-500"
									/>
								</div>
							</motion.div>
						))}
					</AnimatePresence>
				</div>
			)}
		</div>
	);
}
