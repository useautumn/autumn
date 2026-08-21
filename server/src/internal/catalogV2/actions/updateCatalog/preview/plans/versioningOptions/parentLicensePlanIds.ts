import type { FullProduct } from "@autumn/shared";

export const parentLicensePlanIds = ({
	product,
}: {
	product: FullProduct | null | undefined;
}): string[] => [
	...new Set(
		(product?.parent_plan_licenses ?? []).map((link) => link.product.id),
	),
];
