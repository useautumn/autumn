import {
	type ApiPooledBalanceContributionV0,
	type DbPooledBalance,
	numberWithCommas,
} from "@autumn/shared";
import { Button, Input, Separator } from "@autumn/ui";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { SheetPaginationControls } from "@/components/v2/sheets/SheetPaginationControls";
import {
	CONTRIBUTIONS_PAGE_SIZE,
	usePooledBalanceContributionsQuery,
} from "@/hooks/queries/usePooledBalanceContributionsQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { useGoToEntity } from "../../customer/hooks/useGoToEntity";

/** The plans feeding a pooled balance, labelled by entity and plan. */
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

	const sourceLabel = (contribution: ApiPooledBalanceContributionV0) =>
		contribution.entity_name ??
		contribution.entity_id ??
		contribution.plan_name ??
		contribution.plan_id;

	return (
		<>
			<div className="px-4">
				<Separator />
			</div>
			<SheetSection withSeparator={false}>
				<h3 className="text-sub mb-2">Contributions</h3>
				{(totalCount > CONTRIBUTIONS_PAGE_SIZE || search !== "") && (
					<div className="relative mb-3">
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
										{entityId && (
											<span className="text-tertiary-foreground truncate max-w-[140px]">
												{contribution.plan_name ?? contribution.plan_id}
											</span>
										)}
										<span className="text-foreground font-medium tabular-nums">
											+{numberWithCommas(contribution.current_contribution)}
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
			</SheetSection>
		</>
	);
}
