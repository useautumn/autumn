import {
	type Entity,
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductScheduled,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
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

/** Active and scheduled products in the same group do not collide. */
export const findExistingTransferTargetProduct = ({
	fullCustomer,
	toEntity,
	transferringCustomerProducts,
}: {
	fullCustomer: FullCustomer;
	toEntity: Entity | null;
	transferringCustomerProducts: FullCusProduct[];
}) =>
	fullCustomer.customer_products.find(
		(cusProduct) =>
			transferringCustomerProducts.some(
				(transferringCustomerProduct) =>
					isCustomerProductScheduled(cusProduct) ===
						isCustomerProductScheduled(transferringCustomerProduct) &&
					matchesTransferProduct({
						cusProduct,
						product: transferringCustomerProduct.product,
					}),
			) &&
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
				? cusProduct.id === customerProductId &&
					cusProduct.product.id === product.id
				: matchesTransferProduct({ cusProduct, product })) &&
			matchesTransferSource({ cusProduct, fromEntity }),
	);

export const getTransferCustomerProductState = async ({
	ctx,
	fullCustomer,
	fromEntity,
	product,
	customerProductId,
	includeSchedule = true,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	fromEntity: Entity | null;
	product: TransferProduct;
	customerProductId?: string | null;
	includeSchedule?: boolean;
}) => {
	const selectedCustomerProducts = getTransferCustomerProducts({
		fullCustomer,
		fromEntity,
		product,
		customerProductId,
	});
	const selectedIds = selectedCustomerProducts.map(({ id }) => id);
	const phases = includeSchedule
		? await ctx.db
				.select({
					scheduleId: schedules.id,
					customerProductIds: schedulePhases.customer_product_ids,
				})
				.from(schedules)
				.innerJoin(schedulePhases, eq(schedulePhases.schedule_id, schedules.id))
				.where(
					and(
						eq(schedules.org_id, ctx.org.id),
						eq(schedules.env, ctx.env),
						eq(schedules.internal_customer_id, fullCustomer.internal_id),
						fromEntity
							? eq(schedules.internal_entity_id, fromEntity.internal_id)
							: isNull(schedules.internal_entity_id),
					),
				)
		: [];
	const selectedIdSet = new Set(selectedIds);
	const scheduleIds = [
		...new Set(
			phases
				.filter(({ customerProductIds }) =>
					customerProductIds.some((id) => selectedIdSet.has(id)),
				)
				.map(({ scheduleId }) => scheduleId),
		),
	];
	const scheduleIdSet = new Set(scheduleIds);
	const customerProductIds = [
		...new Set([
			...selectedIds,
			...phases
				.filter(({ scheduleId }) => scheduleIdSet.has(scheduleId))
				.flatMap(({ customerProductIds }) => customerProductIds),
		]),
	];
	const customerProductIdSet = new Set(customerProductIds);

	return {
		customerProductIds,
		customerProducts: fullCustomer.customer_products.filter(({ id }) =>
			customerProductIdSet.has(id),
		),
		scheduleIds,
	};
};

export const transferRelatedCustomerProducts = async ({
	ctx,
	toEntity,
	customerProductIds,
	scheduleIds,
}: {
	ctx: AutumnContext;
	toEntity: Entity | null;
	customerProductIds: string[];
	scheduleIds: string[];
}): Promise<TransferEntityUpdates> => {
	const updates = {
		entity_id: toEntity?.id ?? null,
		internal_entity_id: toEntity?.internal_id ?? null,
	};
	await ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx as unknown as DrizzleCli };

		if (scheduleIds.length > 0) {
			await txCtx.db
				.update(schedules)
				.set(updates)
				.where(inArray(schedules.id, scheduleIds));
		}

		for (const cusProductId of customerProductIds) {
			await CusProductService.update({ ctx: txCtx, cusProductId, updates });
		}
	});

	return updates;
};
