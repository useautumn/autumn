import {
	CusProductStatus,
	type Entity,
	type FullCusProduct,
	type FullCustomer,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { and, arrayOverlaps, eq, exists, isNull } from "drizzle-orm";
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
	customerProductId,
}: {
	fullCustomer: FullCustomer;
	fromEntity: Entity | null;
	productId: string;
	customerProductId?: string | null;
}) =>
	fullCustomer.customer_products.find(
		(cusProduct) =>
			(!customerProductId || cusProduct.id === customerProductId) &&
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

export const getTransferCustomerProducts = ({
	fullCustomer,
	fromEntity,
	product,
	customerProductId,
}: {
	fullCustomer: FullCustomer;
	fromEntity: Entity | null;
	product: TransferProduct;
	customerProductId?: string | null;
}) =>
	fullCustomer.customer_products.filter(
		(cusProduct) =>
			(customerProductId
				? cusProduct.id === customerProductId ||
					(cusProduct.status === CusProductStatus.Scheduled &&
						matchesTransferProduct({ cusProduct, product }))
				: matchesTransferProduct({ cusProduct, product })) &&
			matchesTransferSource({ cusProduct, fromEntity }),
	);

export const transferRelatedCustomerProducts = async ({
	ctx,
	fullCustomer,
	fromEntity,
	toEntity,
	product,
	customerProductId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	fromEntity: Entity | null;
	toEntity: Entity | null;
	product: TransferProduct;
	customerProductId?: string | null;
}): Promise<TransferEntityUpdates> => {
	const updates = {
		entity_id: toEntity?.id ?? null,
		internal_entity_id: toEntity?.internal_id ?? null,
	};
	const customerProducts = getTransferCustomerProducts({
		fullCustomer,
		fromEntity,
		product,
		customerProductId,
	});

	await ctx.db
		.update(schedules)
		.set(updates)
		.where(
			and(
				eq(schedules.internal_customer_id, fullCustomer.internal_id),
				fromEntity
					? eq(schedules.internal_entity_id, fromEntity.internal_id)
					: isNull(schedules.internal_entity_id),
				exists(
					ctx.db
						.select()
						.from(schedulePhases)
						.where(
							and(
								eq(schedulePhases.schedule_id, schedules.id),
								arrayOverlaps(
									schedulePhases.customer_product_ids,
									customerProducts.map(({ id }) => id),
								),
							),
						),
				),
			),
		);

	await Promise.all(
		customerProducts.map((cusProduct) =>
			CusProductService.update({
				ctx,
				cusProductId: cusProduct.id,
				updates,
			}),
		),
	);

	return updates;
};
