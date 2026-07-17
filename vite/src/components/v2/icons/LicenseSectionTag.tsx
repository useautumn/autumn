import { SectionTag } from "@autumn/ui";

/** The "Licenses" section tag, shared by the products list and the customer
 * view so the label stays identical. */
export const LicenseSectionTag = ({ className }: { className?: string }) => (
	<SectionTag className={className}>Licenses</SectionTag>
);
