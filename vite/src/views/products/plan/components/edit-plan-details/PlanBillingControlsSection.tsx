import {
	type BillingControlKey,
	type CustomerBillingControls,
	type Feature,
	FeatureType,
	FeatureUsageType,
	PurchaseLimitInterval,
	ResetInterval,
	type SpendLimitType,
} from "@autumn/shared";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	FormLabel,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
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
import { FieldInfo } from "@/components/general/form/field-info";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
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

type SelectOption = { value: string; label: string };

const PURCHASE_INTERVAL_OPTIONS: SelectOption[] = [
	{ value: PurchaseLimitInterval.Hour, label: "Hour" },
	{ value: PurchaseLimitInterval.Day, label: "Day" },
	{ value: PurchaseLimitInterval.Week, label: "Week" },
	{ value: PurchaseLimitInterval.Month, label: "Month" },
];

const USAGE_INTERVAL_OPTIONS: SelectOption[] = [
	{ value: ResetInterval.Day, label: "Day" },
	{ value: ResetInterval.Week, label: "Week" },
	{ value: ResetInterval.Month, label: "Month" },
	{ value: ResetInterval.Year, label: "Year" },
];

const THRESHOLD_TYPE_OPTIONS: SelectOption[] = [
	{ value: "usage", label: "Absolute usage" },
	{ value: "usage_percentage", label: "% used of allowance" },
	{ value: "remaining", label: "Absolute remaining" },
	{ value: "remaining_percentage", label: "% remaining of allowance" },
];

const SPEND_LIMIT_TYPE_OPTIONS: SelectOption[] = [
	{ value: "absolute", label: "Absolute" },
	{ value: "usage_percentage", label: "Usage %" },
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
					<FormLabel className="mb-0.5 text-tertiary-foreground text-xs">
						Feature
					</FormLabel>
					<FeatureSearchDropdown
						features={features}
						value={field.state.value || null}
						onSelect={(value) => field.handleChange(value)}
						iconSize={14}
						itemClassName="py-1 text-xs"
						listClassName="max-h-44"
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

function NumberFieldRow({
	form,
	name,
	label,
	placeholder,
	parse,
}: {
	form: UsePlanBillingControlForm;
	name:
		| "threshold"
		| "quantity"
		| "purchase_limit_limit"
		| "purchase_limit_interval_count"
		| "overage_limit"
		| "usage_limit"
		| "alert_threshold";
	label: string;
	placeholder?: string;
	parse: "float" | "int";
}) {
	return (
		<form.Field name={name}>
			{(field) => (
				<div>
					<FormLabel className="mb-0.5 text-tertiary-foreground text-xs">
						{label}
					</FormLabel>
					<Input
						type="number"
						placeholder={placeholder}
						value={field.state.value ?? ""}
						onChange={(e) => {
							const v = e.target.value;
							if (v === "") {
								field.handleChange(null);
								return;
							}
							field.handleChange(
								parse === "float"
									? Number.parseFloat(v)
									: Number.parseInt(v, 10),
							);
						}}
					/>
					<FieldInfo field={field} />
				</div>
			)}
		</form.Field>
	);
}

function SelectFieldRow({
	form,
	name,
	label,
	placeholder,
	options,
}: {
	form: UsePlanBillingControlForm;
	name: "purchase_limit_interval" | "usage_interval" | "threshold_type";
	label: string;
	placeholder: string;
	options: SelectOption[];
}) {
	return (
		<form.Field name={name}>
			{(field) => (
				<div>
					<FormLabel className="mb-0.5 text-tertiary-foreground text-xs">
						{label}
					</FormLabel>
					<Select
						value={field.state.value}
						onValueChange={(value) =>
							field.handleChange(value as typeof field.state.value)
						}
						items={options}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder={placeholder} />
						</SelectTrigger>
						<SelectContent>
							{options.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<FieldInfo field={field} />
				</div>
			)}
		</form.Field>
	);
}

function AutoTopupFields({ form }: { form: UsePlanBillingControlForm }) {
	return (
		<div className="space-y-2.5">
			<div className="grid grid-cols-2 gap-2.5">
				<NumberFieldRow
					form={form}
					name="threshold"
					label="Threshold"
					placeholder="eg. 100"
					parse="float"
				/>
				<NumberFieldRow
					form={form}
					name="quantity"
					label="Quantity"
					placeholder="eg. 500"
					parse="int"
				/>
			</div>

			<div className="flex flex-col gap-2.5">
				<form.Field name="has_purchase_limit">
					{(field) => (
						<div className="flex items-center justify-between">
							<FormLabel className="mb-0">Purchase limit</FormLabel>
							<Switch
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</div>
					)}
				</form.Field>
				<form.Subscribe selector={(state) => state.values.has_purchase_limit}>
					{(hasPurchaseLimit) =>
						hasPurchaseLimit ? (
							<div className="grid grid-cols-3 gap-2.5">
								<NumberFieldRow
									form={form}
									name="purchase_limit_limit"
									label="Limit"
									placeholder="eg. 5"
									parse="int"
								/>
								<NumberFieldRow
									form={form}
									name="purchase_limit_interval_count"
									label="Every"
									parse="int"
								/>
								<SelectFieldRow
									form={form}
									name="purchase_limit_interval"
									label="Interval"
									placeholder="Interval"
									options={PURCHASE_INTERVAL_OPTIONS}
								/>
							</div>
						) : null
					}
				</form.Subscribe>
			</div>

			<form.Field name="invoice_mode">
				{(field) => (
					<div className="flex items-center justify-between">
						<FormLabel className="mb-0">Invoice mode</FormLabel>
						<Switch
							checked={field.state.value}
							onCheckedChange={field.handleChange}
						/>
					</div>
				)}
			</form.Field>
		</div>
	);
}

function SpendLimitFields({ form }: { form: UsePlanBillingControlForm }) {
	return (
		<div className="flex flex-col gap-2.5">
			<form.Field name="limit_type">
				{(field) => (
					<div>
						<FormLabel className="mb-0.5 text-tertiary-foreground text-xs">
							Limit type
						</FormLabel>
						<Select
							value={field.state.value}
							onValueChange={(value) => {
								field.handleChange(value as SpendLimitType);
								// Units and percent aren't interchangeable.
								form.setFieldValue("overage_limit", null);
							}}
							items={SPEND_LIMIT_TYPE_OPTIONS}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Type" />
							</SelectTrigger>
							<SelectContent>
								{SPEND_LIMIT_TYPE_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
			</form.Field>
			<form.Subscribe selector={(state) => state.values.limit_type}>
				{(limitType) => (
					<NumberFieldRow
						form={form}
						name="overage_limit"
						label={
							limitType === "usage_percentage"
								? "Overage limit (%)"
								: "Overage limit"
						}
						placeholder={
							limitType === "usage_percentage" ? "eg. 120" : "No limit"
						}
						parse="float"
					/>
				)}
			</form.Subscribe>
		</div>
	);
}

function UsageLimitFields({ form }: { form: UsePlanBillingControlForm }) {
	return (
		<div className="grid grid-cols-2 gap-2.5">
			<NumberFieldRow
				form={form}
				name="usage_limit"
				label="Limit"
				placeholder="eg. 1000"
				parse="float"
			/>
			<SelectFieldRow
				form={form}
				name="usage_interval"
				label="Interval"
				placeholder="Interval"
				options={USAGE_INTERVAL_OPTIONS}
			/>
		</div>
	);
}

function UsageAlertFields({ form }: { form: UsePlanBillingControlForm }) {
	return (
		<div className="flex flex-col gap-2.5">
			<form.Field name="alert_name">
				{(field) => (
					<div>
						<FormLabel className="mb-0.5 text-tertiary-foreground text-xs">
							Name
						</FormLabel>
						<Input
							type="text"
							placeholder="Optional"
							value={field.state.value ?? ""}
							onChange={(e) => field.handleChange(e.target.value)}
						/>
						<FieldInfo field={field} />
					</div>
				)}
			</form.Field>
			<div className="grid grid-cols-2 gap-2.5">
				<form.Subscribe selector={(state) => state.values.threshold_type}>
					{(thresholdType) => (
						<NumberFieldRow
							form={form}
							name="alert_threshold"
							label="Threshold"
							placeholder={
								thresholdType === "usage_percentage" ||
								thresholdType === "remaining_percentage"
									? "eg. 80"
									: "eg. 1000"
							}
							parse="float"
						/>
					)}
				</form.Subscribe>
				<SelectFieldRow
					form={form}
					name="threshold_type"
					label="Type"
					placeholder="Type"
					options={THRESHOLD_TYPE_OPTIONS}
				/>
			</div>
		</div>
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
								onCheckedChange={field.handleChange}
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

			<div className="flex justify-between gap-2">
				<div>
					{onDelete && (
						<Button
							variant="ghost"
							size="sm"
							className="text-destructive hover:text-destructive"
							onClick={onDelete}
						>
							Delete
						</Button>
					)}
				</div>
				<div className="flex gap-2">
					<Button variant="secondary" size="sm" onClick={onCancel}>
						Cancel
					</Button>
					<Button size="sm" onClick={() => form.handleSubmit()}>
						Save
					</Button>
				</div>
			</div>
		</div>
	);
}

export function PlanBillingControlsSection({
	hideHeader = false,
}: {
	hideHeader?: boolean;
} = {}) {
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

	const isAdding = editing !== null && editing.index === undefined;

	const renderForm = () => {
		if (!editing) return null;
		return (
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
		);
	};

	const addMenu = ({ fullWidth }: { fullWidth?: boolean }) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="secondary"
					size={fullWidth ? "sm" : "mini"}
					className={cn("gap-2", fullWidth && "w-full")}
				>
					<PlusIcon className="size-3.5" />
					Add billing control
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align={fullWidth ? "start" : "end"}
				className={cn(fullWidth && "w-(--anchor-width)")}
			>
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
	);

	return (
		<div className="space-y-3">
			{!hideHeader && (
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<div className="font-medium text-foreground text-sm">
							Billing controls
						</div>
						<div className="text-tertiary-foreground text-xs">
							Default controls applied when this plan is attached.
						</div>
					</div>
					{addMenu({})}
				</div>
			)}

			<AnimatePresence initial={false}>
				{isAdding && (
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
						{renderForm()}
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
					editingRow={
						editing && editing.index !== undefined
							? { key: editing.key, index: editing.index }
							: undefined
					}
					renderEditingRow={renderForm}
				/>
			) : (
				!hideHeader && (
					<div className="rounded-lg border bg-muted/30 px-3 py-4 text-tertiary-foreground text-sm">
						No plan-level billing controls configured
					</div>
				)
			)}

			{hideHeader && addMenu({ fullWidth: true })}
		</div>
	);
}
