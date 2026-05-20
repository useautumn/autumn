import type { FrontendOrg, OrgConfig } from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/v2/buttons/Button";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { SettingsSection } from "../SettingsSection";

const BILLING_TOGGLES = [
	{ key: "cancel_on_past_due", label: "Cancel on past due", description: "Automatically cancel subscriptions when payment is past due" },
	{ key: "reverse_deduction_order", label: "Reverse deduction order", description: "Deduct from newest balance first instead of oldest" },
	{ key: "include_past_due", label: "Include past due", description: "Include past-due subscriptions when checking entitlements" },
	{ key: "invoice_memos", label: "Invoice memos", description: "Include line-item memos on Stripe invoices" },
	{ key: "entity_product", label: "Entity products", description: "Enable entity-level product assignments" },
	{ key: "void_invoices_on_subscription_deletion", label: "Void invoices on cancellation", description: "Void open invoices when a subscription is deleted" },
	{ key: "default_applies_to_entities", label: "Default plan applies to entities", description: "The default plan is applied at entity level" },
	{ key: "disable_stripe_writes", label: "Disable Stripe writes", description: "Prevent Autumn from writing to Stripe (read-only mode)" },
	{ key: "automatic_tax", label: "Automatic tax", description: "Enable Stripe Tax for automatic tax calculation" },
] as const satisfies readonly { key: keyof OrgConfig; label: string; description: string }[];

export const BillingSettingsSection = () => {
	const { org } = useOrg();
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const env = useEnv();
	const queryKey = ["org", env];
	const [pending, setPending] = useState<Partial<OrgConfig>>({});

	const serverConfig = org?.config ?? {};
	const displayConfig = { ...serverConfig, ...pending };
	const isDirty = Object.keys(pending).length > 0;

	const { mutate, isPending } = useMutation({
		mutationFn: async (updates: Partial<OrgConfig>) => {
			const { data } = await axiosInstance.patch("/organization/config", updates);
			return data as { config: OrgConfig };
		},
		onSuccess: (data) => {
			setPending({});
			queryClient.setQueryData<FrontendOrg>(queryKey, (old) =>
				old ? { ...old, config: data.config } : old,
			);
			toast.success("Billing settings saved");
		},
		onError: () => {
			toast.error("Failed to update billing settings");
			queryClient.invalidateQueries({ queryKey });
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
			title="Billing"
			description="Configure how billing and subscriptions behave"
		>
			<div className="flex flex-col divide-y divide-border rounded-lg border bg-interactive-secondary px-4">
				{BILLING_TOGGLES.map(({ key, label, description }) => (
					<div key={key} className="flex items-center justify-between gap-4 py-3.5">
						<div className="flex flex-col gap-0.5">
							<span className="text-sm font-medium">{label}</span>
							<span className="text-xs text-muted-foreground">{description}</span>
						</div>
						<Switch
							checked={!!displayConfig[key]}
							onCheckedChange={(val) => handleToggle(key, val)}
							disabled={isPending}
						/>
					</div>
				))}
			</div>
			<Button
				variant="primary"
				onClick={handleSave}
				disabled={!isDirty}
				isLoading={isPending}
				className="w-full"
			>
				Save Changes
			</Button>
		</SettingsSection>
	);
};
