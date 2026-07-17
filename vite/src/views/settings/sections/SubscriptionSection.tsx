import { Button } from "@autumn/ui";
import { useCustomer } from "autumn-js/react";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsSection } from "../SettingsSection";

export const SubscriptionSection = () => {
	const { openCustomerPortal } = useCustomer();
	const [isLoading, setIsLoading] = useState(false);

	const handleOpenPortal = async () => {
		setIsLoading(true);
		try {
			await openCustomerPortal();
		} catch {
			toast.error("Failed to open billing portal");
			setIsLoading(false);
		}
	};

	return (
		<SettingsSection
			title="Subscription"
			description="Manage your Autumn subscription and billing"
			card={{
				title: "Billing Portal",
				description:
					"View invoices, update your payment method, and manage your subscription",
			}}
		>
			<Button
				variant="primary"
				onClick={handleOpenPortal}
				isLoading={isLoading}
			>
				Open billing portal
			</Button>
		</SettingsSection>
	);
};
