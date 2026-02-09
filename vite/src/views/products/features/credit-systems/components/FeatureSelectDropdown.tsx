import type { Feature } from "@autumn/shared";
import { CaretDownIcon, PlusIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { cn } from "@/lib/utils";
import { InlineCreateFeatureForm } from "@/views/products/features/credit-systems/components/InlineCreateFeatureForm";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";

export function FeatureSelectDropdown({
	value,
	onValueChange,
	availableFeatures,
	allFeatures,
}: {
	value: string;
	onValueChange: (featureId: string) => void;
	availableFeatures: Feature[];
	allFeatures: Feature[];
}) {
	const [open, setOpen] = useState(false);
	const [showCreateForm, setShowCreateForm] = useState(false);
	const nameInputRef = useRef<HTMLInputElement>(null);

	const handleSelect = (featureId: string) => {
		onValueChange(featureId);
		setOpen(false);
	};

	const handleFeatureCreated = (featureId: string) => {
		onValueChange(featureId);
		setOpen(false);
	};

	const selectedFeature = allFeatures.find((f) => f.id === value);

	return (
		<DropdownMenu
			open={open}
			onOpenChange={(isOpen) => {
				setOpen(isOpen);
				if (!isOpen) {
					// Delay reset so the dropdown closes first without flashing the feature list
					setTimeout(() => setShowCreateForm(false), 150);
				}
			}}
		>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center justify-between w-full rounded-lg border bg-transparent text-sm outline-none h-input input-base input-shadow-default input-state-open p-2",
					)}
				>
					{selectedFeature ? (
						<span className="truncate">{selectedFeature.name}</span>
					) : (
						<span className="text-t4">Select feature</span>
					)}
					<CaretDownIcon className="size-4 opacity-50 shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="min-w-[var(--radix-dropdown-menu-trigger-width)] z-200"
				onCloseAutoFocus={(e) => e.preventDefault()}
			>
				{showCreateForm ? (
					<InlineCreateFeatureForm
						ref={nameInputRef}
						onCreated={handleFeatureCreated}
					/>
				) : (
					<>
						<div className="max-h-60 overflow-y-auto">
							{availableFeatures.map((feature) => (
								<DropdownMenuItem
									key={feature.id}
									onClick={() => handleSelect(feature.id || "")}
									className="py-1 px-2.5 mb-1"
								>
									<div className="flex items-center gap-2">
										<div className="shrink-0">
											{getFeatureIcon({ feature })}
										</div>
										<span className="truncate">{feature.name}</span>
									</div>
								</DropdownMenuItem>
							))}
						</div>
						<div className="border-t pt-1 pb-0 px-0">
							<Button
								variant="muted"
								className="w-full"
								onClick={() => {
									setShowCreateForm(true);
									setTimeout(() => nameInputRef.current?.focus(), 0);
								}}
							>
								<PlusIcon className="size-[14px] text-t2" weight="regular" />
								Create new feature
							</Button>
						</div>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
