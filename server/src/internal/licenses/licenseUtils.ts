import {
	CusProductStatus,
	customerProducts,
	ErrCode,
	type FullProduct,
	isLicenseProduct,
	ProductCatalogType,
	RecaseError,
} from "@autumn/shared";
import { alias } from "drizzle-orm/pg-core";
import { ProductService } from "@/internal/products/ProductService.js";

export const assertLicenseProduct = ({ product }: { product: FullProduct }) => {
	if (!isLicenseProduct({ product })) {
		throw new RecaseError({
			message: `Product ${product.id} is not a license product.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

export const getLicenseProduct = (
	args: Omit<Parameters<typeof ProductService.getFull>[0], "catalogType">,
) =>
	ProductService.getFull({ ...args, catalogType: ProductCatalogType.License });

export const getPaidQuantity = ({
	cusProduct,
}: {
	cusProduct?: { status: string | null; quantity: number | null } | null;
}) =>
	cusProduct?.status === CusProductStatus.Active
		? (cusProduct.quantity ?? 0)
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
