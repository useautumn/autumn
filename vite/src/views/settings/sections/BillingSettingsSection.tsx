import {
	DEFAULT_IDEMPOTENCY_TTL_HOURS,
	type IdempotencyConfig,
	type OrgConfig,
	RouteGroup,
} from "@autumn/shared";
import {
	Button,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
} from "@autumn/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { SettingsSection } from "../SettingsSection";

type TtlUnit = "hours" | "days";

const MAX_TTL_HOURS = 24 * 30;

const toHours = ({ value, unit }: { value: number; unit: TtlUnit }) =>
	unit === "days" ? value * 24 : value;

const fromHours = (hours: number): { value: number; unit: TtlUnit } =>
	hours >= 24 && hours % 24 === 0
		? { value: hours / 24, unit: "days" }
		: { value: hours, unit: "hours" };

const BILLING_TOGGLES = [
	{
		key: "cancel_on_past_due",
		label: "Cancel on past due",
		description: "Automatically cancel subscriptions when payment is past due",
	},
	{
		key: "reverse_deduction_order",
		label: "Reverse deduction order",
		description: "Deduct from newest balance first instead of oldest",
	},
	{
		key: "include_past_due",
		label: "Include past due",
		description: "Include past-due subscriptions when checking entitlements",
	},
	{
		key: "invoice_memos",
		label: "Invoice memos",
		description: "Include line-item memos on Stripe invoices",
	},
	{
		key: "disable_overage_billing",
		label: "Disable overage billing",
		description: "Stop posting usage overage line items to Stripe",
	},
	{
		key: "persist_free_overage",
		label: "Pay down overages",
		description: "Resets and top ups pay down unbilled overages",
	},
	{
		key: "entity_product",
		label: "Entity products",
		description: "Enable entity-level product assignments",
	},
	{
		key: "void_invoices_on_subscription_deletion",
		label: "Void invoices on cancellation",
		description: "Void open invoices when a subscription is deleted",
	},
	{
		key: "default_applies_to_entities",
		label: "Default plan applies to entities",
		description: "The default plan is applied at entity level",
	},
	{
		key: "disable_stripe_writes",
		label: "Disable Stripe writes",
		description: "Prevent Autumn from writing to Stripe (read-only mode)",
	},
	{
		key: "automatic_tax",
		label: "Automatic tax",
		description: "Enable Stripe Tax for automatic tax calculation",
	},
	{
		key: "multi_currency",
		label: "Multi-currency",
		description: "Enable prices and billing in multiple currencies",
	},
] as const satisfies readonly {
	key: keyof OrgConfig;
	label: string;
	description: string;
}[];

export const BillingSettingsSection = () => {
	const { org, mutate: refetchOrg } = useOrg();
	const axiosInstance = useAxiosInstance();
	const [pending, setPending] = useState<Partial<OrgConfig>>({});

	const [pendingTtl, setPendingTtl] = useState<{
		value: number;
		unit: TtlUnit;
	} | null>(null);

	const serverConfig = org?.config ?? {};
	const displayConfig = { ...serverConfig, ...pending };
	const serverTtlHours =
		org?.idempotency_config?.find(
			(entry) => entry.routeGroup === RouteGroup.Balances,
		)?.idempotencyTtl ?? DEFAULT_IDEMPOTENCY_TTL_HOURS;
	const displayTtl = pendingTtl ?? fromHours(serverTtlHours);
	const isTtlDirty =
		pendingTtl !== null && toHours(pendingTtl) !== serverTtlHours;
	const isDirty = Object.keys(pending).length > 0 || isTtlDirty;

	const { mutate, isPending } = useMutation({
		mutationFn: async (
			updates: Partial<OrgConfig> & { idempotency_config?: IdempotencyConfig },
		) => {
			const { data } = await axiosInstance.patch(
				"/organization/config",
				updates,
			);
			return data as { config: OrgConfig };
		},
		onSuccess: async () => {
			await refetchOrg();
			setPending({});
			setPendingTtl(null);
			toast.success("Billing settings saved");
		},
		onError: () => {
			toast.error("Failed to update billing settings");
		},
	});

	const handleToggle = (key: keyof OrgConfig, value: boolean) => {
		setPending((prev) => {
			const next = { ...prev, [key]: value };
			if (serverConfig[key] === value) {
				delete next[key];
			}
			return next;
		});
	};

	const handleSave = () => {
		if (!isDirty || isPending) return;

		if (isTtlDirty && pendingTtl) {
			const ttlHours = toHours(pendingTtl);
			if (
				!Number.isFinite(ttlHours) ||
				ttlHours < 1 ||
				ttlHours > MAX_TTL_HOURS
			) {
				toast.error(
					"Idempotency key duration must be between 1 hour and 30 days",
				);
				return;
			}
		}

		mutate({
			...pending,
			...(isTtlDirty && pendingTtl
				? {
						idempotency_config: [
							{
								routeGroup: RouteGroup.Balances,
								idempotencyTtl: toHours(pendingTtl),
							},
						],
					}
				: {}),
		});
	};

	if (!org) return null;

	return (
		<SettingsSection
			title="Configuration"
			description="Configure how billing and subscriptions behave"
		>
			<div className="flex flex-col divide-y divide-border rounded-lg border bg-interactive-secondary px-4">
				{BILLING_TOGGLES.map(({ key, label, description }) => (
					<div
						key={key}
						className="flex items-center justify-between gap-4 py-3.5"
					>
						<div className="flex flex-col gap-0.5">
							<span className="text-sm font-medium">{label}</span>
							<span className="text-xs text-muted-foreground">
								{description}
							</span>
						</div>
						<Switch
							aria-label={label}
							checked={!!displayConfig[key]}
							onCheckedChange={(val) => handleToggle(key, val)}
							disabled={isPending}
						/>
					</div>
				))}
				<div className="flex items-center justify-between gap-4 py-3.5">
					<div className="flex flex-col gap-0.5">
						<span className="text-sm font-medium">
							Idempotency key duration
						</span>
						<span className="text-xs text-muted-foreground">
							How long duplicate requests to balances endpoints (track, check)
							are rejected
						</span>
					</div>
					<div className="flex items-center gap-2">
						<Input
							type="number"
							aria-label="Idempotency key duration"
							className="w-20"
							min={1}
							max={displayTtl.unit === "days" ? 30 : MAX_TTL_HOURS}
							value={displayTtl.value}
							onChange={(e) =>
								setPendingTtl({
									value: Number(e.target.value),
									unit: displayTtl.unit,
								})
							}
							disabled={isPending}
						/>
						<Select
							value={displayTtl.unit}
							onValueChange={(unit: TtlUnit) =>
								setPendingTtl({ value: displayTtl.value, unit })
							}
							disabled={isPending}
						>
							<SelectTrigger className="w-24" aria-label="Duration unit">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="hours">Hours</SelectItem>
								<SelectItem value="days">Days</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			</div>
			<div className="pb-8">
				<Button
					variant="primary"
					onClick={handleSave}
					disabled={!isDirty}
					isLoading={isPending}
					className="w-full"
				>
					Save Changes
				</Button>
			</div>
		</SettingsSection>
	);
};
