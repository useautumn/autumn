import type { CustomerConfig, FullCustomer } from "@autumn/shared";
import { Button, Switch } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

const CONFIG_TOGGLES = [
	{
		key: "disable_pooled_balance",
		label: "Disable pooled balance",
		description:
			"Disable the shared customer-level balance pool across entities",
	},
	{
		key: "disable_overage_billing",
		label: "Disable overage billing",
		description: "Stop posting usage overage line items to Stripe",
	},
] as const satisfies readonly {
	key: keyof CustomerConfig;
	label: string;
	description: string;
}[];

export function CustomerConfigSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const { customer, refetch } = useCusQuery();
	const axiosInstance = useAxiosInstance();

	const fullCustomer = customer as FullCustomer | undefined;
	const serverConfig = fullCustomer?.config ?? {};

	const [isSaving, setIsSaving] = useState(false);
	const [pending, setPending] = useState<Partial<CustomerConfig>>({});

	const displayConfig = { ...serverConfig, ...pending };
	const isDirty = Object.keys(pending).length > 0;

	const handleToggle = (key: keyof CustomerConfig, value: boolean) => {
		setPending((prev) => {
			const next = { ...prev, [key]: value };
			if (!!serverConfig[key] === value) {
				delete next[key];
			}
			return next;
		});
	};

	const handleSave = async () => {
		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId || !isDirty) return;

		setIsSaving(true);
		try {
			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: customerId,
				data: { config: pending },
			});
			await refetch();
			setPending({});
			closeSheet();
			toast.success("Customer config updated");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update customer config"));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title="Edit Config"
					description="Override billing behaviour for this customer."
				/>

				<div className="flex flex-col divide-y divide-border px-4">
					{CONFIG_TOGGLES.map(({ key, label, description }) => (
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
								checked={!!displayConfig[key]}
								onCheckedChange={(val) => handleToggle(key, val)}
								disabled={isSaving}
							/>
						</div>
					))}
				</div>

				<div className="flex-1" />

				<SheetFooter>
					<Button
						variant="secondary"
						className="w-full"
						onClick={closeSheet}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						className="w-full"
						onClick={handleSave}
						isLoading={isSaving}
						disabled={!isDirty}
					>
						Save
					</Button>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
