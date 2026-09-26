import {
	type BillingControlKey,
	billingControlsFromColumns,
	type Entity,
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
import {
	CaretDownIcon,
	CubeIcon,
	DotsThreeVerticalIcon,
	GavelIcon,
	PlusIcon,
	UserIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useMemo } from "react";
import {
	BillingControlsList,
	hasBillingControls,
} from "@/components/billing-controls/BillingControlsDisplay";
import {
	BILLING_CONTROL_ADD_SHEETS,
	BILLING_CONTROL_EDIT_SHEETS,
} from "@/components/billing-controls/billingControlSheets";
import type { BillingControlOrigin } from "@/components/billing-controls/resolveDisplayedBillingControls";
import { Table } from "@/components/general/table";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCustomerContext } from "../customer/CustomerContext";
import { EmptyState } from "./table/EmptyState";
import { useDisplayedBillingControls } from "./useDisplayedBillingControls";

const ADD_MENU_ITEMS: Array<{ key: BillingControlKey; label: string }> = [
	{ key: "auto_topups", label: "Auto top-up" },
	{ key: "spend_limits", label: "Spend limit" },
	{ key: "usage_limits", label: "Usage limit" },
	{ key: "usage_alerts", label: "Usage alert" },
	{ key: "overage_allowed", label: "Overage allowed" },
];

const SourceBadge = ({
	icon,
	label,
	tooltip,
}: {
	icon: ReactNode;
	label: string;
	tooltip: string;
}) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<span className="flex max-w-[10rem] shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-tertiary-foreground">
				{icon}
				<span className="truncate">{label}</span>
			</span>
		</TooltipTrigger>
		<TooltipContent>{tooltip}</TooltipContent>
	</Tooltip>
);

const PlanCubeIcon = () => (
	<CubeIcon className="size-3 shrink-0 text-violet-500" weight="duotone" />
);

const entityHasBillingControls = (entity: Entity) =>
	hasBillingControls(billingControlsFromColumns(entity));

const entityLabel = (entity: Entity) => entity.name || entity.id;

export function CustomerBillingControlsSection() {
	const {
		billingControls,
		origins,
		fullCustomer,
		selectedEntity,
		featureNameById,
		isLoading,
	} = useDisplayedBillingControls();
	const { setEntityId } = useCustomerContext();
	const setSheet = useSheetStore((s) => s.setSheet);
	const isEntityView = !!selectedEntity;

	const entitiesWithControls = useMemo(
		() => (fullCustomer?.entities ?? []).filter(entityHasBillingControls),
		[fullCustomer?.entities],
	);

	const originOf = ({
		key,
		index,
	}: {
		key: BillingControlKey;
		index: number;
	}) => origins[key]?.[index];

	const openAddSheet = ({
		key,
		featureId,
	}: {
		key: BillingControlKey;
		featureId?: string;
	}) =>
		setSheet({
			type: BILLING_CONTROL_ADD_SHEETS[key],
			data: featureId ? { item: { feature_id: featureId } } : null,
		});

	const addMenuItems = ADD_MENU_ITEMS.filter(
		(menuItem) => !(isEntityView && menuItem.key === "auto_topups"),
	);

	const addControlMenu = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="secondary" size="mini" className="gap-2 font-medium">
					<PlusIcon className="size-3.5" />
					Add Control
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{addMenuItems.map((menuItem) => (
					<DropdownMenuItem
						key={menuItem.key}
						onClick={() => openAddSheet({ key: menuItem.key })}
					>
						{menuItem.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const renderFeatureAddMenu = ({
		featureId,
	}: {
		featureId: string | undefined;
	}) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Feature actions"
					className="flex size-6 cursor-pointer items-center justify-center rounded-md text-tertiary-foreground hover:bg-muted"
				>
					<DotsThreeVerticalIcon size={14} weight="bold" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{addMenuItems.map((menuItem) => (
					<DropdownMenuItem
						key={menuItem.key}
						onClick={() => openAddSheet({ key: menuItem.key, featureId })}
					>
						Add {menuItem.label.toLowerCase()}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const heading = (
		<Table.Heading>
			<GavelIcon size={16} weight="fill" className="text-subtle" />
			Billing controls
			{selectedEntity ? (
				<>
					<span className="font-normal text-tertiary-foreground">
						· {entityLabel(selectedEntity)}
					</span>
					<span className="rounded-md bg-active-primary px-1.5 py-0.5 text-xs font-medium text-primary">
						Entity level
					</span>
				</>
			) : (
				entitiesWithControls.length > 0 && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="flex cursor-pointer items-center gap-1 font-normal text-tertiary-foreground hover:text-foreground"
							>
								· {entitiesWithControls.length}{" "}
								{entitiesWithControls.length === 1 ? "entity" : "entities"}
								<CaretDownIcon className="size-3" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							{entitiesWithControls.map((entity) => (
								<DropdownMenuItem
									key={entity.internal_id}
									onClick={() => setEntityId(entity.id || entity.internal_id)}
								>
									{entityLabel(entity)}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				)
			)}
		</Table.Heading>
	);

	const toolbar = (
		<Table.Toolbar>
			{heading}
			<Table.Actions>{addControlMenu}</Table.Actions>
		</Table.Toolbar>
	);

	if (!isLoading && !hasBillingControls(billingControls)) {
		return (
			<Table.Container>
				{toolbar}
				<EmptyState
					text={
						isEntityView
							? "No billing controls apply to this entity"
							: "No billing controls configured"
					}
				/>
			</Table.Container>
		);
	}

	const badgeFor = (origin: BillingControlOrigin | undefined) => {
		if (origin?.type === "plan") {
			return (
				<SourceBadge
					icon={<PlanCubeIcon />}
					label={origin.planName}
					tooltip={`Inherited from ${origin.planName}`}
				/>
			);
		}
		if (origin?.type === "customer") {
			return (
				<SourceBadge
					icon={<UserIcon className="size-3 shrink-0" />}
					label="Customer"
					tooltip="Set on the customer. Click to edit it there."
				/>
			);
		}
		return null;
	};

	return (
		<Table.Container>
			{toolbar}

			{isLoading ? (
				<EmptyState text="Loading billing controls" />
			) : (
				<BillingControlsList
					billingControls={billingControls}
					featureNameById={featureNameById}
					getRowBadge={({ key, index }) => badgeFor(originOf({ key, index }))}
					getAlertIcon={({ key, index }) =>
						originOf({ key, index })?.type === "plan" ? <PlanCubeIcon /> : null
					}
					renderFeatureActions={renderFeatureAddMenu}
					getSharedSourceBadge={({ controls }) => {
						const [first, ...rest] = controls.map((control) =>
							originOf(control),
						);
						const sharesSource = rest.every((origin) =>
							origin?.type === "plan" && first?.type === "plan"
								? origin.customerProductId === first.customerProductId
								: origin?.type === first?.type,
						);
						return sharesSource ? badgeFor(first) : null;
					}}
					onOpenAlerts={({ featureId }) =>
						setSheet({
							type: "billing-usage-alerts-feature",
							data: { featureId: featureId ?? null },
						})
					}
					onEdit={({ key, index, item }) => {
						const origin = originOf({ key, index });
						if (origin?.type === "customer") {
							setEntityId(null);
							return;
						}
						if (origin?.type === "plan") {
							setSheet({
								type: "billing-control-plan-managed",
								data: {
									key,
									item,
									planName: origin.planName,
									customerProductId: origin.customerProductId,
								},
							});
							return;
						}
						setSheet({
							type: BILLING_CONTROL_EDIT_SHEETS[key],
							data: { index: origin?.index ?? index, item },
						});
					}}
				/>
			)}
		</Table.Container>
	);
}
