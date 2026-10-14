import type { AutumnBillingPlan, FullCustomerLicense } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo";

export const planToNewCustomerLicensePools = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): FullCustomerLicense[] => [
	...autumnBillingPlan.insertCustomerProducts.flatMap(
		(customerProduct) => customerProduct.customer_licenses ?? [],
	),
	...(autumnBillingPlan.patchCustomerProducts ?? []).flatMap(
		(patch) => patch.insertCustomerLicenses ?? [],
	),
];

export const insertCustomerLicensePools = async ({
	ctx,
	customerLicenses,
}: {
	ctx: AutumnContext;
	customerLicenses: FullCustomerLicense[];
}): Promise<void> => {
	await customerLicenseRepo.insertMany({
		db: ctx.db,
		rows: customerLicenses.map(({ planLicense: _planLicense, ...row }) => row),
	});
};
