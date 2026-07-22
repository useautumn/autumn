import { Button, Input } from "@autumn/ui";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { useState } from "react";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { SheetPaginationControls } from "@/components/v2/sheets/SheetPaginationControls";
import { useCustomerContext } from "../../customer/CustomerContext";
import { useGoToEntity } from "../../customer/hooks/useGoToEntity";
import { useCustomerLicenseBalances } from "../customer-licenses/useCustomerLicenseBalances";

const ASSIGNMENTS_PAGE_SIZE = 10;

/** The entities holding a seat on a license, with search, paging, and
 * unassign. `excludeEntityId` drops the viewing entity (and the section
 * entirely when no one else holds a seat). */
export function LicenseAssignedEntities({
	licensePlanId,
	excludeEntityId,
}: {
	licensePlanId: string;
	excludeEntityId?: string;
}) {
	const { customer } = useCustomerContext();
	const goToEntity = useGoToEntity();
	const { assignments, cancelLicenseAssignment } = useCustomerLicenseBalances({
		enabled: true,
	});
	const [unassigningEntityId, setUnassigningEntityId] = useState<string | null>(
		null,
	);
	const [page, setPage] = useState(0);
	const [search, setSearch] = useState("");

	const poolAssignments = assignments.filter(
		(assignment) =>
			assignment.license_plan_id === licensePlanId &&
			assignment.entity_id !== excludeEntityId,
	);
	if (excludeEntityId && poolAssignments.length === 0) return null;

	const entityLabel = (entityId: string) => {
		const entity = customer.entities?.find(
			(candidate) => candidate.id === entityId,
		);
		return entity?.name || entityId;
	};

	const query = search.trim().toLowerCase();
	const filteredAssignments = query
		? poolAssignments.filter((assignment) =>
				`${entityLabel(assignment.entity_id)} ${assignment.entity_id}`
					.toLowerCase()
					.includes(query),
			)
		: poolAssignments;
	const pageCount = Math.ceil(
		filteredAssignments.length / ASSIGNMENTS_PAGE_SIZE,
	);
	// Clamp instead of resetting so unassigning off the last page stays sane.
	const safePage = Math.min(page, Math.max(pageCount - 1, 0));
	const pageStart = safePage * ASSIGNMENTS_PAGE_SIZE;
	const pagedAssignments = filteredAssignments.slice(
		pageStart,
		pageStart + ASSIGNMENTS_PAGE_SIZE,
	);

	return (
		<SheetSection withSeparator={true}>
			<h3 className="text-sub mb-2">Assigned Entities</h3>
			{(poolAssignments.length > ASSIGNMENTS_PAGE_SIZE || search !== "") && (
				<div className="relative mb-3">
					<Input
						placeholder="Search entities..."
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(0);
						}}
						className="w-full pr-8"
						aria-label="Search assigned entities"
					/>
					<MagnifyingGlassIcon
						size={14}
						className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none z-10"
					/>
				</div>
			)}
			{filteredAssignments.length === 0 ? (
				<p className="text-sm text-tertiary-foreground">
					{poolAssignments.length === 0
						? "No entities assigned"
						: "No entities match your search"}
				</p>
			) : (
				<div className="flex flex-col">
					{pagedAssignments.map((assignment) => (
						<div
							key={assignment.id}
							className="flex items-center justify-between h-9 gap-2 text-sm"
						>
							<Button
								variant="skeleton"
								onClick={() => goToEntity(assignment.entity_id)}
								className="font-medium hover:text-purple-600 cursor-pointer min-w-0 px-0! hover:bg-transparent active:bg-transparent active:border-none"
							>
								<span className="truncate">
									{entityLabel(assignment.entity_id)}
								</span>
							</Button>
							<div className="flex items-center gap-3 shrink-0">
								<span className="text-tertiary-foreground">
									{format(new Date(assignment.started_at), "MMM d, yyyy")}
								</span>
								<Button
									variant="secondary"
									size="sm"
									isLoading={unassigningEntityId === assignment.entity_id}
									disabled={unassigningEntityId !== null}
									onClick={async () => {
										setUnassigningEntityId(assignment.entity_id);
										try {
											await cancelLicenseAssignment({
												entityId: assignment.entity_id,
												licensePlanId,
											});
										} finally {
											setUnassigningEntityId(null);
										}
									}}
								>
									Unassign
								</Button>
							</div>
						</div>
					))}
					{pageCount > 1 && (
						<SheetPaginationControls
							rangeStart={pageStart + 1}
							rangeEnd={pageStart + pagedAssignments.length}
							total={filteredAssignments.length}
							canPrev={safePage > 0}
							canNext={safePage < pageCount - 1}
							onPrev={() => setPage(safePage - 1)}
							onNext={() => setPage(safePage + 1)}
						/>
					)}
				</div>
			)}
		</SheetSection>
	);
}
