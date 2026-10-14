import { type Feature, isAiCreditSystem } from "@autumn/shared";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";
import { aiModelCount, creditSources } from "./catalogGrouping";
import { catalogCardClassName, featurePagePath } from "./catalogUi";

const MAX_SOURCES = 2;

export function CreditSystemCard({
	creditSystem,
	features,
}: {
	creditSystem: Feature;
	features: Feature[];
}) {
	const isAi = isAiCreditSystem(creditSystem.type);
	const sources = creditSources({ creditSystem, features });
	const hidden = sources.length - MAX_SOURCES;

	const detail = isAi
		? modelSummary({ count: aiModelCount({ creditSystem }) })
		: sources
				.slice(0, MAX_SOURCES)
				.map((source) => `${source.name} · ${source.cost}`)
				.join(", ");

	return (
		<Link
			to={featurePagePath({ featureId: creditSystem.id })}
			className={cn(
				"flex min-w-0 flex-col gap-0.5 rounded-md px-2 py-1.5",
				catalogCardClassName,
			)}
		>
			<div className="flex min-w-0 items-center gap-1.5">
				{getFeatureIcon({ feature: creditSystem, size: 12 })}
				<span className="truncate text-tiny text-foreground">
					{creditSystem.name}
				</span>
			</div>
			<span
				className="truncate pl-[18px] text-tiny text-subtle"
				title={detail || undefined}
			>
				{detail}
				{!isAi && hidden > 0 && ` +${hidden}`}
				{!detail && "\u00A0"}
			</span>
		</Link>
	);
}

const modelSummary = ({ count }: { count: number }) => {
	if (count === 0) return "Priced per AI model";
	return count === 1 ? "1 model priced" : `${count} models priced`;
};
