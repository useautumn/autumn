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
	// Use column layout when secondary text starts with "then" (indicates pricing with included usage)
	// This handles both flat price and tiered pricing scenarios
	const useColumnLayout =
		item.display.secondaryText?.startsWith("then") ?? false;

	return (
		<div className="flex items-center w-full">
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
					<span className="text-xs text-t3 truncate min-w-0">
						{item.display.secondaryText}
					</span>
				)}
			</div>
		</div>
	);
}
