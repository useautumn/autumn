import { SettingsSection } from "../SettingsSection";
import { InvoiceTemplatesSubsection } from "./components/InvoiceTemplatesSubsection";

export const InvoicesSection = () => {
	return (
		<SettingsSection
			title="Invoices"
			description="Configure how invoices are sent to your customers"
		>
			<InvoiceTemplatesSubsection />
		</SettingsSection>
	);
};
