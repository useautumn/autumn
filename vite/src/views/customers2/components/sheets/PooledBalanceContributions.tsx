import {
	type ApiPooledBalanceContributionV0,
	type DbPooledBalance,
	numberWithCommas,
} from "@autumn/shared";
import {
	Button,
	Input,
	Separator,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { MagnifyingGlassIcon, QuestionIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { SheetPaginationControls } from "@/components/v2/sheets/SheetPaginationControls";
import {
	CONTRIBUTIONS_PAGE_SIZE,
	usePooledBalanceContributionsQuery,
} from "@/hooks/queries/usePooledBalanceContributionsQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { useGoToEntity } from "../../customer/hooks/useGoToEntity";

/** The plans feeding a pooled balance, labelled by source (entity or customer) and plan. */
export function PooledBalanceContributions({
	pooledBalance,
}: {
	pooledBalance: DbPooledBalance | undefined;
}) {
	const [page, setPage] = useState(0);
	const [search, setSearch] = useState("");
	const goToEntity = useGoToEntity();
	const debouncedSearch = useDebounce({ value: search, delayMs: 300 });
	const { contributions, totalCount, totalFilteredCount } =
		usePooledBalanceContributionsQuery({
			pooledBalanceId: pooledBalance?.id,
			page,
			search: debouncedSearch,
		});

	if (!pooledBalance || totalCount === 0) return null;

	const pageStart = page * CONTRIBUTIONS_PAGE_SIZE;
	const pageCount = Math.ceil(totalFilteredCount / CONTRIBUTIONS_PAGE_SIZE);

	/** Customer-scoped contributions have no entity to name. */
	const sourceLabel = (contribution: ApiPooledBalanceContributionV0) =>
		contribution.entity_name ?? contribution.entity_id ?? "Customer";

	const planLabel = (contribution: ApiPooledBalanceContributionV0) =>
		contribution.plan_name ?? contribution.plan_id;

	return (
		<>
			<div className="px-4">
				<Separator />
			</div>
			<SheetSection withSeparator={false}>
				<h3 className="text-sub mb-3">Pooling</h3>
				<div className="flex flex-col gap-4">
					<PoolingCriteria pooledBalance={pooledBalance} />

					<div className="flex flex-col gap-1.5">
						<Subheading>Contributions</Subheading>
						{(totalCount > CONTRIBUTIONS_PAGE_SIZE || search !== "") && (
							<div className="relative mb-1">
								<Input
									placeholder="Search contributions..."
									value={search}
									onChange={(e) => {
										setSearch(e.target.value);
										setPage(0);
									}}
									className="w-full pr-8"
									aria-label="Search contributions"
								/>
								<MagnifyingGlassIcon
									size={14}
									className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none z-10"
								/>
							</div>
						)}
						{contributions.length === 0 ? (
							<p className="text-sm text-tertiary-foreground">
								No contributions match your search
							</p>
						) : (
							<div className="flex flex-col">
								{contributions.map((contribution) => {
									const entityId = contribution.entity_id;
									return (
										<div
											key={contribution.id}
											className="flex items-center justify-between h-9 gap-2 text-sm"
										>
											{entityId ? (
												<Button
													variant="skeleton"
													onClick={() => goToEntity(entityId)}
													className="font-medium hover:text-purple-600 cursor-pointer min-w-0 px-0! hover:bg-transparent active:bg-transparent active:border-none"
												>
													<span className="truncate">
														{sourceLabel(contribution)}
													</span>
												</Button>
											) : (
												<span className="font-medium truncate">
													{sourceLabel(contribution)}
												</span>
											)}
											<div className="flex items-center gap-3 shrink-0">
												<span className="text-tertiary-foreground truncate max-w-[140px]">
													{planLabel(contribution)}
												</span>
												<span className="text-foreground font-medium tabular-nums">
													{pooledBalance.unlimited
														? "Unlimited"
														: `+${numberWithCommas(contribution.current_contribution)}`}
												</span>
											</div>
										</div>
									);
								})}
								{pageCount > 1 && (
									<SheetPaginationControls
										rangeStart={pageStart + 1}
										rangeEnd={pageStart + contributions.length}
										total={totalFilteredCount}
										canPrev={page > 0}
										canNext={page < pageCount - 1}
										onPrev={() => setPage(page - 1)}
										onNext={() => setPage(page + 1)}
									/>
								)}
							</div>
						)}
					</div>
				</div>
			</SheetSection>
		</>
	);
}

function Subheading({ children }: { children: ReactNode }) {
	return (
		<div className="flex items-center gap-1.5 text-tertiary-foreground text-sm font-medium">
			{children}
		</div>
	);
}

/** A pool only merges balances that share its feature plus every property below,
 * so surface this pool's actual values as the match criteria. */
function PoolingCriteria({
	pooledBalance,
}: {
	pooledBalance: DbPooledBalance;
}) {
	const criteria: { label: string; value: string }[] = [
		{ label: "Reset", value: resetLabel(pooledBalance) },
	];

	if (!pooledBalance.unlimited) {
		criteria.push({
			label: "Rollover",
			value: rolloverSignatureToLabel(pooledBalance.rollover_signature),
		});
	}

	return (
		<div className="flex flex-col gap-1.5">
			<Subheading>
				Criteria
				<Tooltip>
					<TooltipTrigger asChild>
						<QuestionIcon className="size-3.5 cursor-help text-tertiary-foreground" />
					</TooltipTrigger>
					<TooltipContent className="max-w-64">
						Balances share this pool only when they match the feature and all of
						these properties.
					</TooltipContent>
				</Tooltip>
			</Subheading>
			{criteria.map((row) => (
				<div
					key={row.label}
					className="flex items-center justify-between text-sm gap-2"
				>
					<span className="text-tertiary-foreground">{row.label}</span>
					<span className="text-foreground font-medium text-right truncate">
						{row.value}
					</span>
				</div>
			))}
		</div>
	);
}

function resetLabel({
	interval,
	interval_count,
}: Pick<DbPooledBalance, "interval" | "interval_count">): string {
	if (interval === "lifetime") return "Lifetime (never resets)";
	if (interval_count > 1) return `Every ${interval_count} ${interval}s`;
	return `Every ${interval}`;
}

/** Reverses rolloverConfigToSignature so the card reads back the same terms the
 * pool matched on. */
function rolloverSignatureToLabel(signature: string): string {
	if (signature === "none") return "None";

	const parts = Object.fromEntries(
		signature.split(";").map((part) => part.split("=") as [string, string]),
	);
	const toNumber = (value?: string) =>
		value && value !== "null" ? Number(value) : null;

	const max = toNumber(parts.max);
	const maxPercentage = toNumber(parts.max_percentage);
	const length = toNumber(parts.length);
	const duration = parts.duration;

	const cap =
		maxPercentage !== null
			? `Up to ${maxPercentage}%`
			: max !== null
				? `Up to ${numberWithCommas(max)}`
				: "All unused";

	if (length !== null && duration) {
		return `${cap}, expires after ${length} ${duration}${length === 1 ? "" : "s"}`;
	}
	return cap;
}
