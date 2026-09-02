import type { FullCustomer, FullCustomerSchedule } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { getCustomerSchedulesByScope } from "@/internal/customers/cusUtils/getFullCustomerSchedule";

export const loadGenerationScheduleContext = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}) => {
	const [{ customerSchedule, entitySchedules }, allCustomerProducts] =
		await Promise.all([
			getCustomerSchedulesByScope({
				ctx,
				internalCustomerId: fullCustomer.internal_id,
			}),
			CusProductService.list({
				db: ctx.db,
				internalCustomerId: fullCustomer.internal_id,
			}),
		]);
	const schedulesByScope = [
		customerSchedule,
		...Object.values(entitySchedules),
	];
	const scheduledProductIds = new Set(
		schedulesByScope.flatMap(
			(schedule) =>
				schedule?.phases.flatMap((phase) => phase.customer_product_ids) ?? [],
		),
	);
	const loadedProductIds = new Set(
		fullCustomer.customer_products.map((product) => product.id),
	);
	const customerProducts = allCustomerProducts.filter(
		(product) =>
			loadedProductIds.has(product.id) || scheduledProductIds.has(product.id),
	);
	const customerProductById = new Map(
		customerProducts.map((product) => [product.id, product]),
	);
	const entityIdByInternalId = new Map(
		customerProducts.flatMap((product) =>
			product.internal_entity_id && product.entity_id
				? [[product.internal_entity_id, product.entity_id]]
				: [],
		),
	);
	const compactSchedule = (
		schedule: FullCustomerSchedule,
		entityId?: string,
	) => ({
		...(entityId ? { entity_id: entityId } : {}),
		phases: schedule.phases.map(({ starts_at, customer_product_ids }) => ({
			starts_at,
			customer_product_ids,
			...(customer_product_ids.some(
				(id) =>
					customerProductById.get(id)?.billing_cycle_anchor_resets_at ===
					starts_at,
			)
				? { billing_cycle_anchor: "phase_start" as const }
				: {}),
		})),
	});

	return {
		customerProducts,
		schedules: [
			...(customerSchedule ? [compactSchedule(customerSchedule)] : []),
			...Object.entries(entitySchedules).map(([internalEntityId, schedule]) =>
				compactSchedule(schedule, entityIdByInternalId.get(internalEntityId)),
			),
		],
	};
};
