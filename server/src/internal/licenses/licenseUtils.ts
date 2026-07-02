import {
	CusProductStatus,
	customerProducts,
	ProductCatalogType,
} from "@autumn/shared";
import { alias } from "drizzle-orm/pg-core";
import { ProductService } from "@/internal/products/ProductService.js";

export const getLicenseProduct = (
	args: Omit<Parameters<typeof ProductService.getFull>[0], "catalogType">,
) =>
	ProductService.getFull({ ...args, catalogType: ProductCatalogType.License });

export const getPaidQuantity = ({
	customerProduct,
}: {
	customerProduct?: { status: string | null; quantity: number | null } | null;
}) =>
	customerProduct?.status === CusProductStatus.Active
		? (customerProduct.quantity ?? 0)
		: 0;

export const parentCustomerProducts = alias(
	customerProducts,
	"parent_customer_products",
);

export const licensePoolParentStatuses = [
	CusProductStatus.Active,
	CusProductStatus.Trialing,
];

export const isLicensePoolParentStatus = ({
	status,
}: {
	status: string | null;
}) => licensePoolParentStatuses.includes(status as CusProductStatus);
