import { Switch } from "@autumn/ui";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const ConvertToChargeAutomaticallySubsection = () => {
	const { org, mutate: refetchOrg } = useOrg();
	const axiosInstance = useAxiosInstance();

	const { mutate, isPending, variables } = useMutation({
		mutationFn: async (enabled: boolean) => {
			await axiosInstance.patch("/organization/config", {
				convert_to_charge_automatically: enabled,
			});
		},
		onSuccess: async () => {
			await refetchOrg();
			toast.success("Automatic charging setting saved");
		},
		onError: () => toast.error("Failed to update automatic charging setting"),
	});

	// While a save is in flight, reflect the value being saved.
	const enabled = isPending
		? (variables ?? true)
		: (org?.config?.convert_to_charge_automatically ?? true);

	return (
		<div className="flex items-center justify-between gap-4">
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-medium">
					Convert to automatic charging
				</span>
				<span className="text-xs text-muted-foreground">
					{enabled
						? "When a customer pays a sent invoice, their payment method is saved and future invoices are charged automatically"
						: "Subscriptions stay in invoice mode — every invoice is sent to the customer for manual payment"}
				</span>
			</div>
			<Switch
				aria-label="Convert to automatic charging"
				checked={enabled}
				onCheckedChange={(value) => mutate(value)}
				disabled={isPending}
			/>
		</div>
	);
};
