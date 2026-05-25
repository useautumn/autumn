import type {
	Entity,
	FullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { nullish } from "@/utils/genUtils.js";
import { CusProductService } from "../../cusProducts/CusProductService.js";

type TransferEntityUpdates = {
	entity_id: string | null;
	internal_entity_id: string | null;
};

type TransferProduct = {
	id: string;
	group: string | null;
	is_add_on: boolean;
};

const matchesTransferSource = ({
	cusProduct,
	fromEntity,
}: {
	cusProduct: FullCusProduct;
	fromEntity: Entity | null;
}) =>
	fromEntity
		? cusProduct.internal_entity_id === fromEntity.internal_id
		: nullish(cusProduct.internal_entity_id);

const matchesTransferProduct = ({
	cusProduct,
	product,
}: {
	cusProduct: FullCusProduct;
	product: TransferProduct;
}) =>
	product.is_add_on
		? cusProduct.product_id === product.id
		: cusProduct.product.group === product.group &&
			!cusProduct.product.is_add_on;

export const findTransferCustomerProduct = ({
	fullCustomer,
	fromEntity,
	productId,
}: {
	fullCustomer: FullCustomer;
	fromEntity: Entity | null;
	productId: string;
}) =>
	fullCustomer.customer_products.find(
		(cusProduct) =>
			matchesTransferSource({ cusProduct, fromEntity }) &&
			cusProduct.product.id === productId,
	);

export const findExistingTransferTargetProduct = ({
	fullCustomer,
	toEntity,
	product,
}: {
	fullCustomer: FullCustomer;
	toEntity: Entity | null;
	product: TransferProduct;
}) =>
	fullCustomer.customer_products.find(
		(cusProduct) =>
			matchesTransferProduct({ cusProduct, product }) &&
			(toEntity
				? cusProduct.internal_entity_id === toEntity.internal_id
				: nullish(cusProduct.internal_entity_id)),
	);

export const transferRelatedCustomerProducts = async ({
	ctx,
	fullCustomer,
	fromEntity,
	toEntity,
	product,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	fromEntity: Entity | null;
	toEntity: Entity | null;
	product: TransferProduct;
}): Promise<TransferEntityUpdates> => {
	const updates = {
		entity_id: toEntity?.id ?? null,
		internal_entity_id: toEntity?.internal_id ?? null,
	};

	await Promise.all(
		fullCustomer.customer_products
			.filter(
				(cusProduct) =>
					matchesTransferProduct({ cusProduct, product }) &&
					matchesTransferSource({ cusProduct, fromEntity }),
			)
			.map((cusProduct) =>
				CusProductService.update({
					ctx,
					cusProductId: cusProduct.id,
					updates,
				}),
			),
	);

	return updates;
};
