import {
	type BillingControlKey,
	type CustomerBillingControls,
	type Feature,
	FeatureType,
	FeatureUsageType,
	PurchaseLimitInterval,
	ResetInterval,
} from "@autumn/shared";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	FormLabel,
	Switch,
} from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	BillingControlsList,
	hasBillingControls,
} from "@/components/billing-controls/BillingControlsDisplay";
import type { SelectFieldOption } from "@/components/general/form/fields/select-field";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	buildControlItem,
	type ControlItem,
	type PlanBillingControlFormValues,
	type UsePlanBillingControlForm,
	usePlanBillingControlForm,
} from "./usePlanBillingControlForm";

const EXPAND_TRANSITION = {
	duration: 0.2,
	ease: [0.32, 0.72, 0, 1] as const,
};

const CONTROL_LABELS: Record<BillingControlKey, string> = {
	auto_topups: "Auto top-up",
	spend_limits: "Spend limit",
	usage_limits: "Usage limit",
	usage_alerts: "Usage alert",
	overage_allowed: "Overage allowed",
};

const PURCHASE_INTERVAL_OPTIONS: SelectFieldOption[] = [
	{ value: PurchaseLimitInterval.Hour, label: "Hour" },
	{ value: PurchaseLimitInterval.Day, label: "Day" },
	{ value: PurchaseLimitInterval.Week, label: "Week" },
	{ value: PurchaseLimitInterval.Month, label: "Month" },
];

const USAGE_INTERVAL_OPTIONS: SelectFieldOption[] = [
	{ value: ResetInterval.Day, label: "Day" },
	{ value: ResetInterval.Week, label: "Week" },
	{ value: ResetInterval.Month, label: "Month" },
	{ value: ResetInterval.Year, label: "Year" },
];

const THRESHOLD_TYPE_OPTIONS: SelectFieldOption[] = [
	{ value: "usage", label: "Absolute usage" },
	{ value: "usage_percentage", label: "% used of allowance" },
	{ value: "remaining", label: "Absolute remaining" },
	{ value: "remaining_percentage", label: "% remaining of allowance" },
];

const UNIQUE_FEATURE_KEYS = [
	"spend_limits",
	"usage_limits",
	"overage_allowed",
] as const;

type UniqueFeatureKey = (typeof UNIQUE_FEATURE_KEYS)[number];

function isUniqueFeatureKey(key: BillingControlKey): key is UniqueFeatureKey {
	return (UNIQUE_FEATURE_KEYS as readonly BillingControlKey[]).includes(key);
}

function hasDuplicateFeature({
	existingControls,
	controlKey,
	featureId,
	editIndex,
}: {
	existingControls: CustomerBillingControls;
	controlKey: UniqueFeatureKey;
	featureId: string;
	editIndex?: number;
}) {
	if (!featureId) return false;
	return (existingControls[controlKey] ?? []).some(
		(control, index) => index !== editIndex && control.feature_id === featureId,
	);
}

function FeatureField({
	form,
	features,
	optional,
}: {
	form: UsePlanBillingControlForm;
	features: Feature[];
	optional: boolean;
}) {
	return (
		<form.Field name="feature_id">
			{(field) => (
				<div>
					<FormLabel>Feature</FormLabel>
					<FeatureSearchDropdown
						features={features}
						value={field.state.value || null}
						onSelect={(value) => field.handleChange(value)}
						placeholder={
							optional
								? "Optional — leave empty for global"
								: "Select a feature"
						}
						footer={
							optional && field.state.value ? (
								<button
									type="button"
									className="w-full rounded-md px-2 py-1.5 text-left text-xs text-tertiary-foreground hover:bg-muted"
									onClick={() => field.handleChange("")}
								>
									Use global scope
								</button>
							) : undefined
						}
					/>
				</div>
			)}
		</form.Field>
	);
}

function AutoTopupFields({ form }: { form: UsePlanBillingControlForm }) {
	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<form.AppField name="threshold">
					{(field) => <field.NumberField label="Threshold" min={0} float />}
				</form.AppField>
				<form.AppField name="quantity">
					{(field) => <field.NumberField label="Quantity" min={1} />}
				</form.AppField>
			</div>
			<form.Field name="has_purchase_limit">
				{(field) => (
					<div className="flex items-center justify-between">
						<FormLabel className="mb-0">Purchase limit</FormLabel>
						<Switch
							checked={field.state.value}
							onCheckedChange={(checked) => field.handleChange(checked)}
						/>
					</div>
				)}
			</form.Field>
			<form.Subscribe selector={(state) => state.values.has_purchase_limit}>
				{(hasPurchaseLimit) =>
					hasPurchaseLimit ? (
						<div className="grid grid-cols-3 gap-3">
							<form.AppField name="purchase_limit_limit">
								{(field) => <field.NumberField label="Limit" min={1} />}
							</form.AppField>
							<form.AppField name="purchase_limit_interval_count">
								{(field) => <field.NumberField label="Every" min={1} />}
							</form.AppField>
							<form.AppField name="purchase_limit_interval">
								{(field) => (
									<field.SelectField
										label="Interval"
										placeholder="Interval"
										options={PURCHASE_INTERVAL_OPTIONS}
									/>
								)}
							</form.AppField>
						</div>
					) : null
				}
			</form.Subscribe>
			<form.Field name="invoice_mode">
				{(field) => (
					<div className="flex items-center justify-between">
						<FormLabel className="mb-0">Invoice mode</FormLabel>
						<Switch
							checked={field.state.value}
							onCheckedChange={(checked) => field.handleChange(checked)}
						/>
					</div>
				)}
			</form.Field>
		</>
	);
}

function SpendLimitFields({ form }: { form: UsePlanBillingControlForm }) {
	return (
		<form.AppField name="overage_limit">
			{(field) => (
				<field.NumberField
					label="Overage limit"
					placeholder="Optional — leave empty for no limit"
					min={0}
					float
				/>
			)}
		</form.AppField>
	);
}

function UsageLimitFields({ form }: { form: UsePlanBillingControlForm }) {
	return (
		<div className="grid grid-cols-2 gap-3">
			<form.AppField name="usage_limit">
				{(field) => <field.NumberField label="Limit" min={0} float />}
			</form.AppField>
			<form.AppField name="usage_interval">
				{(field) => (
					<field.SelectField
						label="Interval"
						placeholder="Interval"
						options={USAGE_INTERVAL_OPTIONS}
					/>
				)}
			</form.AppField>
		</div>
	);
}

function UsageAlertFields({ form }: { form: UsePlanBillingControlForm }) {
	return (
		<>
			<form.AppField name="alert_name">
				{(field) => (
					<field.TextField label="Name" type="text" placeholder="Optional" />
				)}
			</form.AppField>
			<div className="grid grid-cols-2 gap-3">
				<form.AppField name="alert_threshold">
					{(field) => <field.NumberField label="Threshold" min={0} float />}
				</form.AppField>
				<form.AppField name="threshold_type">
					{(field) => (
						<field.SelectField
							label="Type"
							placeholder="Type"
							options={THRESHOLD_TYPE_OPTIONS}
						/>
					)}
				</form.AppField>
			</div>
		</>
	);
}

function ControlTypeFields({
	controlKey,
	form,
}: {
	controlKey: BillingControlKey;
	form: UsePlanBillingControlForm;
}) {
	if (controlKey === "auto_topups") return <AutoTopupFields form={form} />;
	if (controlKey === "spend_limits") return <SpendLimitFields form={form} />;
	if (controlKey === "usage_limits") return <UsageLimitFields form={form} />;
	if (controlKey === "usage_alerts") return <UsageAlertFields form={form} />;
	return null;
}

function PlanBillingControlForm({
	controlKey,
	item,
	onSave,
	onCancel,
	onDelete,
	features,
	existingControls,
	editIndex,
}: {
	controlKey: BillingControlKey;
	item?: ControlItem;
	onSave: (item: ControlItem) => void;
	onCancel: () => void;
	onDelete?: () => void;
	features: Feature[];
	existingControls: CustomerBillingControls;
	editIndex?: number;
}) {
	const handleValidSubmit = (values: PlanBillingControlFormValues) => {
		const featureId = values.feature_id.trim();
		if (
			isUniqueFeatureKey(controlKey) &&
			hasDuplicateFeature({
				existingControls,
				controlKey,
				featureId,
				editIndex,
			})
		) {
			toast.error("Only one control is allowed per feature");
			return;
		}
		onSave(buildControlItem(controlKey, values));
	};

	const form = usePlanBillingControlForm({
		controlKey,
		item,
		onValidSubmit: handleValidSubmit,
	});

	const nonBooleanFeatures = features.filter(
		(feature) => !feature.archived && feature.type !== FeatureType.Boolean,
	);
	const autoTopupFeatures = nonBooleanFeatures.filter(
		(feature) => feature.config?.usage_type !== FeatureUsageType.Continuous,
	);
	const selectableFeatures =
		controlKey === "auto_topups" ? autoTopupFeatures : nonBooleanFeatures;
	const featureOptional =
		controlKey === "spend_limits" || controlKey === "usage_alerts";

	return (
		<div className="space-y-3 rounded-lg border bg-background p-3">
			<div className="flex items-center justify-between gap-3">
				<div className="font-medium text-sm">
					{item ? "Edit" : "Add"} {CONTROL_LABELS[controlKey].toLowerCase()}
				</div>
				<form.Field name="enabled">
					{(field) => (
						<div className="flex items-center gap-2">
							<FormLabel className="mb-0 text-tertiary-foreground text-xs">
								Enabled
							</FormLabel>
							<Switch
								checked={field.state.value}
								onCheckedChange={(checked) => field.handleChange(checked)}
							/>
						</div>
					)}
				</form.Field>
			</div>

			<FeatureField
				form={form}
				features={selectableFeatures}
				optional={featureOptional}
			/>

			<ControlTypeFields controlKey={controlKey} form={form} />

			<div className="flex justify-between gap-2 pt-1">
				<div>
					{onDelete && (
						<Button
							variant="ghost"
							className="text-destructive hover:text-destructive"
							onClick={onDelete}
						>
							Delete
						</Button>
					)}
				</div>
				<div className="flex gap-2">
					<Button variant="secondary" onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={() => form.handleSubmit()}>Save</Button>
				</div>
			</div>
		</div>
	);
}

export function PlanBillingControlsSection() {
	const { product, setProduct } = useProduct();
	const { features = [] } = useFeaturesQuery();
	const [editing, setEditing] = useState<{
		key: BillingControlKey;
		index?: number;
		item?: ControlItem;
	} | null>(null);

	const billingControls = product.billing_controls ?? {};
	const featureNameById = useMemo(
		() => new Map(features.map((feature) => [feature.id, feature.name])),
		[features],
	);

	const setControlItems = (key: BillingControlKey, items: ControlItem[]) => {
		setProduct({
			...product,
			billing_controls: {
				...billingControls,
				[key]: items,
			},
		});
	};

	const saveItem = (item: ControlItem) => {
		if (!editing) return;
		const current = [
			...((billingControls[editing.key] ?? []) as ControlItem[]),
		];
		if (editing.index === undefined) {
			current.push(item);
		} else {
			current[editing.index] = item;
		}
		setControlItems(editing.key, current);
		setEditing(null);
	};

	const deleteItem = () => {
		if (!editing || editing.index === undefined) return;
		const current = [
			...((billingControls[editing.key] ?? []) as ControlItem[]),
		];
		current.splice(editing.index, 1);
		setControlItems(editing.key, current);
		setEditing(null);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="font-medium text-foreground text-sm">
						Billing controls
					</div>
					<div className="text-tertiary-foreground text-xs">
						Default controls applied when this plan is attached.
					</div>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="secondary" size="mini" className="gap-2">
							<PlusIcon className="size-3.5" />
							Add
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{Object.entries(CONTROL_LABELS).map(([key, label]) => (
							<DropdownMenuItem
								key={key}
								onClick={() => setEditing({ key: key as BillingControlKey })}
							>
								{label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<AnimatePresence initial={false}>
				{editing && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{
							height: "auto",
							opacity: 1,
							transition: {
								height: EXPAND_TRANSITION,
								opacity: { duration: 0.15, delay: 0.05 },
							},
						}}
						exit={{ height: 0, opacity: 0, transition: EXPAND_TRANSITION }}
						className="overflow-hidden"
					>
						<PlanBillingControlForm
							key={`${editing.key}-${editing.index ?? "new"}`}
							controlKey={editing.key}
							item={editing.item}
							editIndex={editing.index}
							features={features}
							existingControls={billingControls}
							onSave={saveItem}
							onDelete={editing.index === undefined ? undefined : deleteItem}
							onCancel={() => setEditing(null)}
						/>
					</motion.div>
				)}
			</AnimatePresence>

			{hasBillingControls(billingControls) ? (
				<BillingControlsList
					billingControls={billingControls}
					featureNameById={featureNameById}
					onEdit={({ key, index, item }) =>
						setEditing({ key, index, item: item as ControlItem })
					}
				/>
			) : (
				<div className="rounded-lg border bg-muted/30 px-3 py-4 text-tertiary-foreground text-sm">
					No plan-level billing controls configured
				</div>
			)}
		</div>
	);
}
