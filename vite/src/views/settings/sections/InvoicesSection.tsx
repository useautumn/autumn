import { SettingsSection } from "../SettingsSection";
import { AllowedPaymentMethodsSubsection } from "./components/AllowedPaymentMethodsSubsection";
import { InvoiceTemplatesSubsection } from "./components/InvoiceTemplatesSubsection";

export const InvoicesSection = () => {
	return (
		<SettingsSection
			title="Invoices"
			description="Configure how invoices are sent to your customers"
		>
			<InvoiceTemplatesSubsection />
			<AllowedPaymentMethodsSubsection />
		</SettingsSection>
	);
};
