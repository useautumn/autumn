import {
	BILLING_CONTROL_KEYS,
	type BillingControlKey,
	billingControlsFromColumns,
	type CustomerBillingControls,
	type Entity,
	type Feature,
	type FullCustomer,
	getPlanBillingControlProducts,
} from "@autumn/shared";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { CubeIcon, GavelIcon, PlusIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import {
	BillingControlsList,
	hasBillingControls,
} from "@/components/billing-controls/BillingControlsDisplay";
import { Table } from "@/components/general/table";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "../customer/CustomerContext";
import { EmptyState } from "./table/EmptyState";

const PlanBadge = ({ planName }: { planName: string }) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<span className="flex max-w-[10rem] shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-tertiary-foreground">
				<CubeIcon
					className="size-3 shrink-0 text-violet-500"
					weight="duotone"
				/>
				<span className="truncate">{planName}</span>
			</span>
		</TooltipTrigger>
		<TooltipContent>Inherited from {planName}</TooltipContent>
	</Tooltip>
);

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

	const billingControls = billingControlsFromColumns(
		selectedEntity ?? fullCustomer,
	);

	const entitiesWithControlsCount =
		fullCustomer?.entities?.filter(
			(entity: Entity) =>
				(entity.spend_limits?.length ?? 0) > 0 ||
				(entity.usage_limits?.length ?? 0) > 0 ||
				(entity.usage_alerts?.length ?? 0) > 0 ||
				(entity.overage_allowed?.length ?? 0) > 0,
		).length ?? 0;
	const isEntityView = !!selectedEntity;

	const planControlSource = useMemo(() => {
		const source = new Map<
			string,
			{ customerProductId: string; planName: string }
		>();
		if (isEntityView) return source;

		const planProducts = getPlanBillingControlProducts({
			customerProducts: fullCustomer?.customer_products ?? [],
		});
		for (const planProduct of planProducts) {
			for (const key of BILLING_CONTROL_KEYS) {
				for (const control of planProduct.product[key] ?? []) {
					const overridden = (billingControls[key] ?? []).some(
						(editable) => editable.feature_id === control.feature_id,
					);
					const sourceKey = `${key}:${control.feature_id ?? ""}`;
					if (!overridden && !source.has(sourceKey)) {
						source.set(sourceKey, {
							customerProductId: planProduct.id,
							planName: planProduct.product.name,
						});
					}
				}
			}
		}
		return source;
	}, [fullCustomer?.customer_products, billingControls, isEntityView]);

	const mergedControls = useMemo((): CustomerBillingControls => {
		const merged: CustomerBillingControls = {};
		const planProducts = getPlanBillingControlProducts({
			customerProducts: fullCustomer?.customer_products ?? [],
		});
		for (const key of BILLING_CONTROL_KEYS) {
			const customerItems = billingControls[key] ?? [];
			const planItems = isEntityView
				? []
				: planProducts
						.flatMap((planProduct) => planProduct.product[key] ?? [])
						.filter((control) =>
							planControlSource.has(`${key}:${control.feature_id ?? ""}`),
						);
			const items = [...customerItems, ...planItems];
			if (items.length) {
				merged[key] = items as CustomerBillingControls[typeof key];
			}
		}
		return merged;
	}, [
		billingControls,
		fullCustomer?.customer_products,
		isEntityView,
		planControlSource,
	]);

	const hasAnyMergedControls = hasBillingControls(mergedControls);

	const planSourceFor = ({
		key,
		item,
	}: {
		key: BillingControlKey;
		item: { feature_id?: string };
	}) => planControlSource.get(`${key}:${item.feature_id ?? ""}`);

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

	if (!isLoading && !hasAnyMergedControls && !isEntityView) {
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
					billingControls={mergedControls}
					featureNameById={featureNameById}
					emptyText={
						isEntityView
							? "No billing controls set on this entity"
							: "No billing controls configured"
					}
					getRowBadge={({ key, item }) => {
						const planSource = planSourceFor({ key, item });
						return planSource ? (
							<PlanBadge planName={planSource.planName} />
						) : null;
					}}
					onEdit={({ key, index, item }) => {
						const planSource = planSourceFor({ key, item });
						if (planSource) {
							setSheet({
								type: "subscription-detail",
								itemId: planSource.customerProductId,
							});
							return;
						}
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
