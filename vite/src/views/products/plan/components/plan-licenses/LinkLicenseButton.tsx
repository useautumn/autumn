import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { useLinkableLicenses } from "./useLinkableLicenses";

/**
 * Visible "Link License" affordance under a plan's license cards. Stages a
 * pending license card, same as the toolbar menu item. Hidden when nothing is
 * linkable — Create License next to it covers that state.
 */
export function LinkLicenseButton() {
	const { isLicense, availableLicenses, linkLicense } = useLinkableLicenses();

	if (isLicense || availableLicenses.length === 0) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="dotted"
					className="w-full max-w-xl !h-9 !rounded-xl !bg-transparent !border-dashed text-tertiary-foreground hover:text-foreground"
				>
					<PlusIcon className="size-3" weight="bold" />
					Link License
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="center" sideOffset={4}>
				{availableLicenses.map((license) => (
					<DropdownMenuItem
						key={license.id}
						className="flex items-center gap-2 text-xs"
						onClick={() => linkLicense(license.id)}
					>
						<LicenseIcon size={12} />
						{license.name ?? license.id}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
