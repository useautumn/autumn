import { type Feature, isAiCreditSystem } from "@autumn/shared";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";
import { aiModelCount, creditSources } from "./catalogGrouping";

/** Cells are one line of detail; past this the names stop being readable. */
const MAX_SOURCES = 2;

/** A credit system's whole point is the conversion — what an action costs — so
 * the mapping sits under the name rather than the name standing alone. */
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

	// AI systems price models instead of mapping features, so they'd otherwise
	// render as a bare name next to fully-described siblings.
	const detail = isAi
		? modelSummary({ count: aiModelCount({ creditSystem }) })
		: sources
				.slice(0, MAX_SOURCES)
				.map((source) => `${source.name} · ${source.cost}`)
				.join(", ");

	return (
		<div className="flex min-w-0 flex-col gap-0.5 rounded-md border bg-interactive-secondary px-2 py-1.5">
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
				{/* Keeps every cell the same height whether or not it has detail. */}
				{!detail && "\u00A0"}
			</span>
		</div>
	);
}

const modelSummary = ({ count }: { count: number }) => {
	if (count === 0) return "Priced per AI model";
	return count === 1 ? "1 model priced" : `${count} models priced`;
};
