import type {
	CustomerBillingControls,
	Entity,
	Feature,
	FullCustomer,
} from "@autumn/shared";
import { Button } from "@autumn/ui";
import { GavelIcon, PlusIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import {
	BillingControlsList,
	hasBillingControls,
} from "@/components/billing-controls/BillingControlsDisplay";
import { Table } from "@/components/general/table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "../customer/CustomerContext";
import { EmptyState } from "./table/EmptyState";

export function CustomerBillingControlsSection() {
	const { customer, features, isLoading } = useCusQuery();
	const { entityId } = useCustomerContext();
	const setSheet = useSheetStore((s) => s.setSheet);

	const fullCustomer = customer as FullCustomer | undefined;

	const selectedEntity = useMemo(() => {
		if (!entityId) return null;
		return (
			fullCustomer?.entities.find(
				(entity: Entity) =>
					entity.id === entityId || entity.internal_id === entityId,
			) ?? null
		);
	}, [entityId, fullCustomer?.entities]);

	const featureNameById = useMemo(
		() =>
			new Map(
				(features ?? []).map((feature: Feature) => [feature.id, feature.name]),
			),
		[features],
	);

	const billingControls: CustomerBillingControls = selectedEntity
		? {
				spend_limits: selectedEntity.spend_limits ?? undefined,
				usage_limits: selectedEntity.usage_limits ?? undefined,
				usage_alerts: selectedEntity.usage_alerts ?? undefined,
				overage_allowed: selectedEntity.overage_allowed ?? undefined,
			}
		: {
				auto_topups: fullCustomer?.auto_topups ?? undefined,
				spend_limits: fullCustomer?.spend_limits ?? undefined,
				usage_limits: fullCustomer?.usage_limits ?? undefined,
				usage_alerts: fullCustomer?.usage_alerts ?? undefined,
				overage_allowed: fullCustomer?.overage_allowed ?? undefined,
			};

	const hasAnyControls = hasBillingControls(billingControls);
	const entitiesWithControlsCount =
		fullCustomer?.entities?.filter(
			(entity: Entity) =>
				(entity.spend_limits?.length ?? 0) > 0 ||
				(entity.usage_limits?.length ?? 0) > 0 ||
				(entity.usage_alerts?.length ?? 0) > 0 ||
				(entity.overage_allowed?.length ?? 0) > 0,
		).length ?? 0;
	const isEntityView = !!selectedEntity;

	const addControlMenu = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="secondary" size="mini" className="gap-2 font-medium">
					<PlusIcon className="size-3.5" />
					Add Control
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{!selectedEntity && (
					<DropdownMenuItem
						onClick={() => setSheet({ type: "billing-auto-topup-add" })}
					>
						Auto top-up
					</DropdownMenuItem>
				)}
				<DropdownMenuItem
					onClick={() => setSheet({ type: "billing-spend-limit-add" })}
				>
					Spend limit
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => setSheet({ type: "billing-usage-limit-add" })}
				>
					Usage limit
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => setSheet({ type: "billing-usage-alert-add" })}
				>
					Usage alert
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => setSheet({ type: "billing-overage-allowed-add" })}
				>
					Overage allowed
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	if (!isLoading && !hasAnyControls && !isEntityView) {
		const customerEmptyText =
			entitiesWithControlsCount > 0
				? `No customer-level billing controls — billing controls exist on ${entitiesWithControlsCount} ${entitiesWithControlsCount === 1 ? "entity" : "entities"}`
				: "No billing controls configured";

		return (
			<Table.Container>
				<Table.Toolbar>
					<Table.Heading>
						<GavelIcon size={16} weight="fill" className="text-subtle" />
						Billing controls
					</Table.Heading>
					<Table.Actions>{addControlMenu}</Table.Actions>
				</Table.Toolbar>
				<EmptyState text={customerEmptyText} />
			</Table.Container>
		);
	}

	return (
		<Table.Container>
			<Table.Toolbar>
				<Table.Heading>
					<GavelIcon size={16} weight="fill" className="text-subtle" />
					Billing controls
				</Table.Heading>
				<Table.Actions>{addControlMenu}</Table.Actions>
			</Table.Toolbar>

			{isLoading ? (
				<EmptyState text="Loading billing controls" />
			) : (
				<BillingControlsList
					billingControls={billingControls}
					featureNameById={featureNameById}
					emptyText={
						isEntityView
							? "No billing controls set on this entity"
							: "No billing controls configured"
					}
					onEdit={({ key, index, item }) => {
						const sheetType = {
							auto_topups: "billing-auto-topup-edit",
							spend_limits: "billing-spend-limit-edit",
							usage_limits: "billing-usage-limit-edit",
							usage_alerts: "billing-usage-alert-edit",
							overage_allowed: "billing-overage-allowed-edit",
						}[key] as Parameters<typeof setSheet>[0]["type"];
						setSheet({ type: sheetType, data: { index, item } });
					}}
				/>
			)}
		</Table.Container>
	);
}
