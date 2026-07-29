import type { OrgConfig } from "@autumn/shared";
import { Button, Switch } from "@autumn/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { SettingsSection } from "../SettingsSection";

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

	const serverConfig = org?.config ?? {};
	const displayConfig = { ...serverConfig, ...pending };
	const isDirty = Object.keys(pending).length > 0;

	const { mutate, isPending } = useMutation({
		mutationFn: async (updates: Partial<OrgConfig>) => {
			const { data } = await axiosInstance.patch(
				"/organization/config",
				updates,
			);
			return data as { config: OrgConfig };
		},
		onSuccess: async () => {
			await refetchOrg();
			setPending({});
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
		mutate(pending);
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
