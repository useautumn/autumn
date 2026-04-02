import type { Feature } from "@autumn/shared";
import { CaretDownIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import type React from "react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./DropdownMenu";

export function FeatureSearchDropdown({
	features,
	value,
	onSelect,
	placeholder = "Select a feature",
	open,
	onOpenChange,
	renderExtra,
	footer,
}: {
	features: Feature[];
	value: string | null;
	onSelect: (featureId: string) => void;
	placeholder?: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	renderExtra?: (feature: Feature) => React.ReactNode;
	footer?: React.ReactNode;
}) {
	const [internalOpen, setInternalOpen] = useState(false);
	const [search, setSearch] = useState("");

	const isControlled = open !== undefined;
	const isOpen = isControlled ? open : internalOpen;
	const setIsOpen = (next: boolean) => {
		if (!isControlled) setInternalOpen(next);
		onOpenChange?.(next);
		if (!next) setSearch("");
	};

	const selectedFeature = features.find((f) => f.id === value);

	const filteredFeatures = useMemo(
		() =>
			features.filter((f) =>
				f.name.toLowerCase().includes(search.toLowerCase()),
			),
		[features, search],
	);

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center justify-between w-full rounded-lg border bg-transparent text-sm outline-none h-input input-base input-shadow-default input-state-open p-2",
					)}
				>
					{selectedFeature ? (
						<div className="flex items-center gap-2">
							<div className="shrink-0">
								{getFeatureIcon({ feature: selectedFeature })}
							</div>
							<span className="truncate">{selectedFeature.name}</span>
						</div>
					) : (
						<span className="text-t4">{placeholder}</span>
					)}
					<CaretDownIcon className="size-4 opacity-50" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-(--radix-dropdown-menu-trigger-width)"
			>
				<div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
					<MagnifyingGlassIcon className="size-4 text-t4" />
					<input
						type="text"
						placeholder="Search features..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						onKeyDown={(e) => e.stopPropagation()}
						className="flex-1 bg-transparent text-sm outline-none placeholder:text-t4"
					/>
				</div>
				<div className="max-h-60 overflow-y-auto">
					{filteredFeatures.length === 0 ? (
						<div className="py-4 text-center text-sm text-t4">
							No features found.
						</div>
					) : (
						filteredFeatures.map((feature: Feature) => (
							<DropdownMenuItem
								key={feature.id}
								onClick={() => {
									onSelect(feature.id);
									setIsOpen(false);
								}}
								className="py-2 px-2.5"
							>
								<div className="flex items-center gap-2 w-full">
									<div className="shrink-0">{getFeatureIcon({ feature })}</div>
									<span className="truncate flex-1">{feature.name}</span>
									{renderExtra?.(feature)}
								</div>
							</DropdownMenuItem>
						))
					)}
				</div>
				{footer}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
