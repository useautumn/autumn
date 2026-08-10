import type { Feature, FullCusEntWithFullCusProduct } from "@autumn/shared";
import { SectionTag, Tabs, TabsList, TabsTrigger } from "@autumn/ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { flagPillClassName, OVERFLOW_PILL_CLASSNAME } from "./FlagPill";
import { useFlagsView } from "./useFlagsView";

type FlagsView = "enabled" | "catalog";

const FLAGS_LABEL = "Flags";
const FLAG_VIEWS: { value: FlagsView; label: string }[] = [
	{ value: "enabled", label: FLAGS_LABEL },
	{ value: "catalog", label: "Full Catalog" },
];

// The primitive's active chip is near-black and its track is bg-muted, a point
// off interactive-secondary in dark mode — neither separates from the card.
const TAB_CLASSNAME = cn(
	"px-2.5 py-0.5 rounded-md text-xs font-medium text-tertiary-foreground",
	"transition-colors hover:text-foreground",
	"data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm",
	"dark:data-[active]:bg-background dark:data-[active]:text-foreground",
);

const ENTER_TRANSITION = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;
const EXIT_TRANSITION = { duration: 0.12, ease: "easeOut" } as const;
// No spring — bouncing the row height would shove everything below it around.
const HEIGHT_TRANSITION = { duration: 0.25, ease: [0.23, 1, 0.32, 1] } as const;

export function CustomerFlagsSection({
	booleanEnts,
	availableFeatures,
}: {
	booleanEnts: FullCusEntWithFullCusProduct[];
	availableFeatures: Feature[];
}) {
	const reduceMotion = useReducedMotion() ?? false;
	const hasCatalog = availableFeatures.length > 0;
	const {
		showingCatalog,
		expanded,
		isCollapsed,
		visibleEnts,
		hiddenCount,
		hasOverflow,
		rowHeight,
		containerRef,
		measureRef,
		rowRef,
		setShowingCatalog,
		toggleExpanded,
	} = useFlagsView({ booleanEnts, hasCatalog });

	// Pills keep their slot across views — only trailing ones are added or
	// removed — so a plain fade reads calmer than layout animation plus scale.
	const pillMotion = {
		initial: { opacity: 0 },
		animate: { opacity: 1 },
		exit: { opacity: 0, transition: EXIT_TRANSITION },
		transition: reduceMotion ? { duration: 0 } : ENTER_TRANSITION,
	};

	// Catalog is an expansion of the customer's flags, never a section on its own.
	if (booleanEnts.length === 0) return null;

	return (
		<div className="flex flex-col">
			{hasCatalog ? (
				<div className="flex items-center mb-3">
					<Tabs
						value={showingCatalog ? "catalog" : "enabled"}
						onValueChange={(value) => setShowingCatalog(value === "catalog")}
					>
						<TabsList className="h-auto gap-0.5 p-0.5 rounded-lg bg-muted dark:bg-muted">
							{FLAG_VIEWS.map(({ value, label }) => (
								<TabsTrigger
									key={value}
									value={value}
									className={TAB_CLASSNAME}
								>
									{label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</div>
			) : (
				<SectionTag>{FLAGS_LABEL}</SectionTag>
			)}

			<div ref={containerRef} className="relative">
				{/* Always mounted — gating this on the view would leave the count stale
				    for a frame when returning to Flags, collapsing to the wrong width. */}
				<div
					ref={measureRef}
					aria-hidden
					className="absolute -top-[9999px] left-0 flex gap-2 pointer-events-none"
				>
					{booleanEnts.map((ent) => (
						<div
							key={ent.entitlement.feature.id}
							className={flagPillClassName(true)}
						>
							{ent.entitlement.feature.name}
						</div>
					))}
					<div className={OVERFLOW_PILL_CLASSNAME}>Show less</div>
				</div>

				<motion.div
					animate={{ height: rowHeight }}
					transition={reduceMotion ? { duration: 0 } : HEIGHT_TRANSITION}
					className="overflow-hidden"
				>
					<div
						ref={rowRef}
						className={cn(
							"flex gap-2 flex-wrap",
							// Clip to one row by height, not nowrap: nowrap lets the row
							// exceed the container, parking trailing children off-screen
							// right until the count catches up.
							isCollapsed && "max-h-10 overflow-hidden",
						)}
					>
						<AnimatePresence initial={false}>
							{visibleEnts.map((ent) => (
								<motion.div
									key={ent.entitlement.feature.id}
									{...pillMotion}
									className={flagPillClassName(true)}
								>
									{ent.entitlement.feature.name}
								</motion.div>
							))}

							{showingCatalog &&
								availableFeatures.map((feature) => (
									<motion.div
										key={feature.id}
										{...pillMotion}
										className={flagPillClassName(false)}
									>
										{feature.name}
									</motion.div>
								))}
						</AnimatePresence>

						{hasOverflow && (
							<button
								type="button"
								onClick={toggleExpanded}
								className={cn(
									OVERFLOW_PILL_CLASSNAME,
									"cursor-pointer transition-colors hover:text-foreground hover:border-solid",
									"animate-in fade-in-0 duration-500 ease-out",
								)}
							>
								{expanded ? "Show less" : `+${hiddenCount} more`}
							</button>
						)}
					</div>
				</motion.div>
			</div>
		</div>
	);
}
