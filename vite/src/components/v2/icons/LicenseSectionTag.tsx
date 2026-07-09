import { SectionTag } from "@autumn/ui";
import { LicenseIcon } from "./LicenseIcon";

/** The "Licenses" section tag (icon + label), shared by the products list and
 * the customer view so the label stays identical. */
export const LicenseSectionTag = ({ className }: { className?: string }) => (
	<SectionTag className={className}>
		<span className="flex items-center gap-1">
			<LicenseIcon size={11} className="text-subtle" />
			Licenses
		</span>
	</SectionTag>
);
