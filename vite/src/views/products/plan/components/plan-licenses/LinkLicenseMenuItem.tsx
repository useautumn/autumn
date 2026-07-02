import { isLicenseProduct } from "@autumn/shared";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@autumn/ui";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import { runWithErrorToast } from "./runWithErrorToast";

/**
 * "Link license" entry for the plan toolbar (ellipsis) dropdown: a sub-menu of
 * license subplans that aren't already linked to this plan. Hidden when the
 * product itself is a license.
 */
export const LinkLicenseMenuItem = () => {
	const { product } = useProduct();
	const isLicense = isLicenseProduct({ product });

	const { planLicenses, setPlanLicense } = usePlanLicensesQuery(
		isLicense ? undefined : product.id,
	);
	const { licenseProducts } = useLicenseProductsQuery();

	if (isLicense) return null;

	const linkedIds = new Set(
		planLicenses.map((planLicense) => planLicense.license_plan_id),
	);
	const availableLicenses = licenseProducts.filter(
		(license) => !linkedIds.has(license.id),
	);

	const linkLicense = (licensePlanId: string) =>
		runWithErrorToast(
			() =>
				setPlanLicense.mutateAsync({
					parent_plan_id: product.id,
					license_plan_id: licensePlanId,
					included_quantity: 1,
					allow_extra_quantity: false,
				}),
			"Failed to link license",
		);

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center text-xs">
				<div className="flex items-center justify-between w-full gap-2">
					Link license
					<LicenseIcon size={12} className="text-tertiary-foreground" />
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
