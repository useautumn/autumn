import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
	StatusChip,
	StatusChipIcon,
} from "@autumn/ui";
import { overlaySurfaceClassName } from "@autumn/ui/lib/overlay-classes";
import {
	type CustomDiffChange,
	type CustomDiffField,
	type CustomerProductCustomDiff,
	useCustomerProductCustomDiff,
} from "./useCustomerProductCustomDiff";

const KIND_ICONS = {
	added: { tone: "green", glyph: "plusCircle", label: "Added" },
	removed: { tone: "red", glyph: "minus", label: "Removed" },
	changed: { tone: "amber", glyph: "pencil", label: "Changed" },
} as const;

const OUTCOME_NOTES: Record<
	Exclude<CustomerProductCustomDiff["outcome"], "customized">,
	string
> = {
	matches_catalog:
		"Matches its catalog version, so the stored flag is out of date.",
	revenuecat: "RevenueCat plans can't be customized.",
	catalog_missing:
		"The catalog version couldn't be loaded, so this plan is treated as custom.",
	comparison_failed:
		"The comparison with the catalog failed, so this plan is treated as custom.",
};

const describeValue = (value: unknown): string => {
	if (value === null || value === undefined) return "none";
	if (typeof value === "number")
		return value.toLocaleString("en-US", { maximumFractionDigits: 20 });
	if (Array.isArray(value))
		return value.length === 0 ? "none" : value.map(describeValue).join(" · ");
	if (typeof value === "object")
		return Object.entries(value)
			.filter(([, child]) => child !== null && child !== undefined)
			.map(
				([key, child]) => `${key.replace(/_/g, " ")} ${describeValue(child)}`,
			)
			.join(", ");
	return String(value);
};

const formatTerm = (term: string | null) =>
	term === null ? "none" : describeValue(JSON.parse(term));

const isTellingField = ({
	field,
	kind,
}: {
	field: CustomDiffField;
	kind: CustomDiffChange["kind"];
}) => {
	if (kind === "changed") return true;
	if (field.path === "feature_id") return false;
	const term = kind === "added" ? field.customer : field.catalog;
	return term !== "false" && term !== "null";
};

const formatPath = (path: string) =>
	path.replace(/_/g, " ").replace(/\./g, " › ");

function ChangedField({
	field,
	kind,
}: {
	field: CustomDiffField;
	kind: CustomDiffChange["kind"];
}) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<span className="shrink-0 text-tertiary-foreground">
				{formatPath(field.path)}
			</span>
			<span className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-1.5 text-right tabular-nums">
				{kind !== "added" && field.catalog !== null && (
					<span className="min-w-0 break-words text-tertiary-foreground line-through decoration-tertiary-foreground/60">
						{formatTerm(field.catalog)}
					</span>
				)}
				{kind === "changed" && field.catalog !== null && (
					<span className="text-tertiary-foreground">→</span>
				)}
				{kind !== "removed" && (
					<span className="min-w-0 break-words font-medium text-foreground">
						{formatTerm(field.customer)}
					</span>
				)}
			</span>
		</div>
	);
}

function ChangeEntry({
	change,
	featureNameById,
}: {
	change: CustomDiffChange;
	featureNameById: Map<string, string>;
}) {
	const icon = KIND_ICONS[change.kind];
	const fields = change.fields.filter((field) =>
		isTellingField({ field, kind: change.kind }),
	);
	const label =
		change.target === "base_price"
			? "Base price"
			: change.target === "license"
				? `License · ${change.id}`
				: (featureNameById.get(change.id ?? "") ?? change.id);

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-1.5">
				<StatusChipIcon tone={icon.tone} glyph={icon.glyph} />
				<span className="min-w-0 truncate text-[13px] leading-[18px] font-medium text-foreground">
					{label}
				</span>
				<span className="ml-auto shrink-0 text-tertiary-foreground">
					{icon.label}
				</span>
			</div>
			{fields.length > 0 && (
				<div className="flex flex-col gap-1 pl-[22px]">
					{fields.map((field) => (
						<ChangedField key={field.path} field={field} kind={change.kind} />
					))}
				</div>
			)}
		</div>
	);
}

function CustomDiffBody({
	diff,
	isLoading,
	isError,
	featureNameById,
}: {
	diff?: CustomerProductCustomDiff;
	isLoading: boolean;
	isError: boolean;
	featureNameById: Map<string, string>;
}) {
	if (isLoading)
		return (
			<span className="text-tertiary-foreground">Comparing with catalog…</span>
		);
	if (isError || !diff)
		return (
			<span className="text-tertiary-foreground">
				Couldn't load the differences.
			</span>
		);
	if (diff.outcome !== "customized")
		return (
			<span className="text-tertiary-foreground">
				{OUTCOME_NOTES[diff.outcome]}
			</span>
		);

	return (
		<>
			{diff.changes.map((change, index) => (
				<div
					key={`${change.target}-${change.id ?? index}`}
					className="flex flex-col gap-2.5"
				>
					{index > 0 && (
						<div className="h-px shrink-0 bg-overlay-separator preset:bg-border" />
					)}
					<ChangeEntry change={change} featureNameById={featureNameById} />
				</div>
			))}
		</>
	);
}

export function CustomPlanDiffHoverCard({
	customerId,
	customerProductId,
	catalogVersion,
	featureNameById,
}: {
	customerId?: string;
	customerProductId: string;
	catalogVersion: number;
	featureNameById: Map<string, string>;
}) {
	const { data, isLoading, isError } = useCustomerProductCustomDiff({
		customerId,
		customerProductId,
	});

	return (
		<HoverCard>
			<HoverCardTrigger asChild delay={150} closeDelay={0}>
				<span className="inline-flex cursor-default">
					<StatusChip tone="fuchsia" glyph="pencil">
						Custom
					</StatusChip>
				</span>
			</HoverCardTrigger>
			<HoverCardContent
				side="bottom"
				align="start"
				sideOffset={8}
				className={`${overlaySurfaceClassName} flex w-80 flex-col gap-2.5 p-3 text-xs`}
			>
				<div className="flex flex-col gap-0.5">
					<span className="text-[13px] leading-[18px] font-semibold text-foreground">
						Custom plan
					</span>
					<span className="text-tertiary-foreground">
						Differences from version {catalogVersion} of the catalog plan
					</span>
				</div>
				<div className="h-px shrink-0 bg-overlay-separator preset:bg-border" />
				<div className="-mr-3 flex max-h-[min(24rem,calc(var(--available-height)-6rem))] flex-col gap-2.5 overflow-y-auto pr-3">
					<CustomDiffBody
						diff={data}
						isLoading={isLoading}
						isError={isError}
						featureNameById={featureNameById}
					/>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
