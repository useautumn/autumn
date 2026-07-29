import type { Feature } from "@autumn/shared";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";

interface FeatureSelectorProps {
	features: Feature[];
	selectedFeatureId: string | null;
	onFeatureChange: (featureId: string) => void;
	className?: string;
}

export function FeatureSelector({
	features,
	selectedFeatureId,
	onFeatureChange,
	className,
}: FeatureSelectorProps) {
	const [open, setOpen] = useState(false);
	const selectedFeature = features.find((f) => f.id === selectedFeatureId);

	const handleSelect = (featureId: string) => {
		onFeatureChange(featureId);
		setOpen(false);
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center justify-between rounded-lg border bg-transparent text-sm outline-none input-base input-shadow-default input-state-open p-2 w-40 h-6!",
					)}
				>
					{selectedFeature ? (
						<div className="flex items-center gap-2">
							<div className="shrink-0">
								{getFeatureIcon({ feature: selectedFeature })}
							</div>
							<span className="text-muted-foreground truncate w-26 text-left">
								{selectedFeature.name}
							</span>
						</div>
					) : (
						<span className="text-subtle text-xs">Select feature</span>
					)}
					<CaretDownIcon className="size-3 opacity-50" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="z-[160]">
				<div className="max-h-60 overflow-y-auto">
					{features.length === 0 ? (
						<div className="py-4 text-center text-sm text-subtle">
							No features found.
						</div>
					) : (
						features.map((feature) => (
							<DropdownMenuItem
								key={feature.id}
								onClick={() => handleSelect(feature.id)}
								className="py-2 px-2.5"
							>
								<div className="flex items-center gap-2">
									<div className="shrink-0">{getFeatureIcon({ feature })}</div>
									<span className="truncate">{feature.name}</span>
								</div>
							</DropdownMenuItem>
						))
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
