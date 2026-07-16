import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@autumn/ui";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { useLinkableLicenses } from "./useLinkableLicenses";

/**
 * "Link license" entry for the plan toolbar (ellipsis) dropdown: a sub-menu of
 * license subplans that aren't already linked to this plan. Linking only stages
 * a pending card — the link persists when the plan save bar is saved. Hidden
 * when the product itself is a license.
 */
export const LinkLicenseMenuItem = () => {
	const { isLicense, availableLicenses, linkLicense } = useLinkableLicenses();

	if (isLicense) return null;

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center text-xs">
				<div className="flex items-center gap-2">
					<LicenseIcon size={12} className="text-tertiary-foreground" />
					Link license
				</div>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				{availableLicenses.length === 0 ? (
					<DropdownMenuItem disabled className="text-xs">
						No licenses available
					</DropdownMenuItem>
				) : (
					availableLicenses.map((license) => (
						<DropdownMenuItem
							key={license.id}
							className="text-xs"
							onClick={() => linkLicense(license.id)}
						>
							{license.name ?? license.id}
						</DropdownMenuItem>
					))
				)}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
};
