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
 * Visible "Link License" affordance for the customize editor, where the plan
 * toolbar (and its Link license menu item) is hidden. Stages a pending license
 * card, same as the menu item. Hidden when there are no other plans to link.
 */
export function LinkLicenseButton() {
	const { isLicense, hasAnyLinkablePlans, availableLicenses, linkLicense } =
		useLinkableLicenses();

	if (isLicense || !hasAnyLinkablePlans) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="dotted"
					className="w-full max-w-xl !h-9 !rounded-xl !bg-transparent !border-dashed text-tertiary-foreground hover:text-foreground"
					disabled={availableLicenses.length === 0}
				>
					<PlusIcon className="size-3" weight="bold" />
					{availableLicenses.length === 0
						? "All licenses linked"
						: "Link License"}
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
