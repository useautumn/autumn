import type { Feature } from "@autumn/shared";
import { cn } from "@/lib/utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./selects/Select";

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
	const selectedFeature = features.find((f) => f.id === selectedFeatureId);

	return (
		<Select value={selectedFeatureId ?? ""} onValueChange={onFeatureChange}>
			<SelectTrigger className={cn("min-w-32 h-6!", className)}>
				<SelectValue placeholder="Select feature">
					{selectedFeature && (
						<span className="font-mono text-xs">{selectedFeature.id}</span>
					)}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{features.map((feature) => (
					<SelectItem key={feature.id} value={feature.id}>
						<span className="font-mono text-xs">{feature.id}</span>
						<span className="text-t3 ml-2">{feature.name}</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
