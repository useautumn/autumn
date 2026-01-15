import { PreviewFeatureIcon } from "./PreviewFeatureIcon";
import type { PreviewProductItem } from "./previewTypes";

interface PreviewFeatureRowProps {
	item: PreviewProductItem;
}

/** Compact dot separator between icons */
function DotIcon() {
	return <div className="w-[2px] h-[2px] mx-0.5 bg-current rounded-full" />;
}

export function PreviewFeatureRow({ item }: PreviewFeatureRowProps) {
	// Use column layout only if item has both pricing AND included usage
	const hasPricing = item.price != null && item.price > 0;
	const hasIncludedUsage =
		item.includedUsage != null &&
		(item.includedUsage === "inf" || item.includedUsage > 0);
	const useColumnLayout = hasPricing && hasIncludedUsage;

	return (
		<div className="flex items-center w-full px-2 bg-card">
			<div
				className={`flex gap-1 min-w-0 overflow-hidden ${useColumnLayout ? "flex-col" : "flex-row items-center"}`}
			>
				<div className="flex items-center gap-1.5">
					{/* Feature icons */}
					<div className="flex items-center gap-0.5 shrink-0">
						<PreviewFeatureIcon item={item} position="left" size={12} />
						<DotIcon />
						<PreviewFeatureIcon item={item} position="right" size={12} />
					</div>
					<span className="text-xs text-foreground truncate">
						{item.display.primaryText}
					</span>
				</div>
				{item.display.secondaryText && (
					<span className="text-xs text-t3 truncate shrink-0">
						{item.display.secondaryText}
					</span>
				)}
			</div>
		</div>
	);
}
