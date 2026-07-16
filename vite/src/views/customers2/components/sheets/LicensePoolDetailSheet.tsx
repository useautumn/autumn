import { productV2ToFrontendProduct } from "@autumn/shared";
import { Button, CopyButton, IconButton, InfoRow, Input } from "@autumn/ui";
import {
	CaretLeftIcon,
	CaretRightIcon,
	ChartBarIcon,
	HashIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { useState } from "react";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useCustomerContext } from "../../customer/CustomerContext";
import { useCustomerLicenseBalances } from "../customer-licenses/useCustomerLicenseBalances";
import { SubscriptionDetailItems } from "./SubscriptionDetailItems";

const ID_CHIP_INNER_CLASS = "max-w-40 text-tiny-id truncate !font-normal";
const ASSIGNMENTS_PAGE_SIZE = 10;

/** Detail sheet for a customer-level license pool (itemId = license plan id):
 * the license's items, pool inventory, and every entity holding a seat. */
export function LicensePoolDetailSheet() {
	const licensePlanId = useSheetStore((s) => s.itemId);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const { customer } = useCustomerContext();
	const { setEntityId } = useEntity();
	const { pools, assignments, isLoading, cancelLicenseAssignment } =
		useCustomerLicenseBalances({ enabled: true });
	const [unassigningEntityId, setUnassigningEntityId] = useState<string | null>(
		null,
	);
	const [page, setPage] = useState(0);
	const [search, setSearch] = useState("");
	const { licenseProducts } = useLicenseProductsQuery();

	const pool = pools.find(
		(candidate) => candidate.license_plan_id === licensePlanId,
	);
	const license = licenseProducts.find(
		(candidate) => candidate.id === licensePlanId,
	);
	const poolAssignments = assignments.filter(
		(assignment) => assignment.license_plan_id === licensePlanId,
	);

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

	if (!pool) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="License Details"
					description={
						isLoading
							? "Loading license information..."
							: "This license no longer exists."
					}
				/>
			</div>
		);
	}

	const goToEntity = (entityId: string) => {
		const entity = customer.entities?.find(
			(candidate) => candidate.id === entityId,
		);
		if (!entity) return;
		closeSheet();
		setEntityId(entity.internal_id);
	};

	return (
		<div className="flex flex-col h-full overflow-y-auto">
			<SheetHeader
				title={
					<span className="flex items-center gap-2">
						<LicenseIcon size={16} />
						{pool.license_plan_name}
					</span>
				}
				description={`Entities assigned ${pool.license_plan_name}`}
			/>

			{license && license.items.length > 0 && (
				<SubscriptionDetailItems
					items={license.items}
					product={productV2ToFrontendProduct({ product: license })}
				/>
			)}

			<SheetSection withSeparator={true}>
				<div className="space-y-3">
					<InfoRow
						icon={<HashIcon size={16} />}
						label="ID"
						value={
							<CopyButton
								text={pool.license_plan_id}
								size="mini"
								className="text-tertiary-foreground"
								innerClassName={ID_CHIP_INNER_CLASS}
							/>
						}
					/>
					<InfoRow
						icon={<ChartBarIcon size={16} weight="duotone" />}
						label="Availability"
						value={`${pool.remaining} of ${pool.granted} available`}
					/>
				</div>
			</SheetSection>

			<SheetSection withSeparator={true}>
				<h3 className="text-sub mb-2">Assigned Entities</h3>
				{poolAssignments.length > ASSIGNMENTS_PAGE_SIZE && (
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
													licensePlanId: pool.license_plan_id,
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
							<div className="flex items-center justify-between pt-3">
								<span className="text-xs text-tertiary-foreground tabular-nums">
									{pageStart + 1}–{pageStart + pagedAssignments.length} of{" "}
									{filteredAssignments.length}
								</span>
								<div className="flex items-center gap-1">
									<IconButton
										aria-label="Previous page"
										icon={<CaretLeftIcon size={14} />}
										iconOrientation="center"
										variant="secondary"
										size="sm"
										disabled={safePage === 0}
										onClick={() => setPage(safePage - 1)}
									/>
									<IconButton
										aria-label="Next page"
										icon={<CaretRightIcon size={14} />}
										iconOrientation="center"
										variant="secondary"
										size="sm"
										disabled={safePage >= pageCount - 1}
										onClick={() => setPage(safePage + 1)}
									/>
								</div>
							</div>
						)}
					</div>
				)}
			</SheetSection>
		</div>
	);
}
