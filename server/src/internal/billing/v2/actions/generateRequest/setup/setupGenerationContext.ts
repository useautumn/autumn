import type {
	Entity,
	Feature,
	FullCusProduct,
	FullProduct,
} from "@autumn/shared";
import {
	cusProductToProduct,
	mapToProductV2,
	productV2ToApiPlanV1,
	toCreatePlanItemParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { getCustomerSchedulesByScope } from "@/internal/customers/cusUtils/getFullCustomerSchedule";
import { FeatureService } from "@/internal/features/FeatureService";
import { ProductService } from "@/internal/products/ProductService";

const compactPlan = ({
	product,
	features,
}: {
	product: FullProduct;
	features: Feature[];
}) => {
	const productV2 = mapToProductV2({ features, product });
	const apiPlan = productV2ToApiPlanV1({
		features,
		includeProration: true,
		product: productV2,
	});
	return {
		id: productV2.id,
		name: productV2.name,
		version: productV2.version,
		...(productV2.group ? { group: productV2.group } : {}),
		...(productV2.is_add_on ? { is_add_on: true } : {}),
		...(apiPlan.free_trial ? { free_trial: apiPlan.free_trial } : {}),
		price: apiPlan.price
			? {
					amount: apiPlan.price.amount,
					interval: apiPlan.price.interval,
					...(apiPlan.price.interval_count && apiPlan.price.interval_count !== 1
						? { interval_count: apiPlan.price.interval_count }
						: {}),
					...(apiPlan.price.additional_currencies?.length
						? { additional_currencies: apiPlan.price.additional_currencies }
						: {}),
				}
			: null,
		items: apiPlan.items.map((item) => toCreatePlanItemParams(item)),
	};
};

export const compactCustomerProduct = ({
	customerProduct,
	entities,
}: {
	customerProduct: FullCusProduct;
	entities: Entity[];
}) => {
	const entity = entities.find(
		(candidate) => candidate.internal_id === customerProduct.internal_entity_id,
	);
	const entityId = entity?.id ?? customerProduct.entity_id;
	return {
		customer_product_id: customerProduct.id,
		plan_id: customerProduct.product.id,
		status: customerProduct.status,
		...(entityId ? { entity_id: entityId } : {}),
		...(customerProduct.canceled ? { canceled: true } : {}),
		...(customerProduct.trial_ends_at
			? { trial_ends_at: customerProduct.trial_ends_at }
			: {}),
		...(customerProduct.options?.length
			? { prepaid_quantities: customerProduct.options }
			: {}),
	};
};

export const setupGenerationContext = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) => {
	const [fullProducts, features, fullCustomer] = await Promise.all([
		ProductService.listFull({ db: ctx.db, env: ctx.env, orgId: ctx.org.id }),
		FeatureService.list({ db: ctx.db, env: ctx.env, orgId: ctx.org.id }),
		CusService.getFull({ ctx, idOrInternalId: customerId, withEntities: true }),
	]);
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
	const scheduledProductIds = new Set(
		[customerSchedule, ...Object.values(entitySchedules)].flatMap(
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
	const entities = fullCustomer.entities ?? [];
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
		schedule: NonNullable<typeof customerSchedule>,
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
	const schedules = [
		...(customerSchedule ? [compactSchedule(customerSchedule)] : []),
		...Object.entries(entitySchedules).map(([internalEntityId, schedule]) =>
			compactSchedule(schedule, entityIdByInternalId.get(internalEntityId)),
		),
	];

	const now = Date.now();

	return {
		context: {
			customer: {
				id: fullCustomer.id,
				...(fullCustomer.name ? { name: fullCustomer.name } : {}),
				current_plans: customerProducts.map((customerProduct) => ({
					...compactCustomerProduct({
						customerProduct,
						entities,
					}),
					effective_plan: compactPlan({
						features,
						product: cusProductToProduct({ cusProduct: customerProduct }),
					}),
				})),
				entities: entities.map((entity) => ({
					id: entity.id,
					...(entity.name ? { name: entity.name } : {}),
					...(entity.feature_id ? { feature_id: entity.feature_id } : {}),
				})),
				...(schedules.length ? { schedules } : {}),
			},
			features: features.map((feature) => ({
				id: feature.id,
				name: feature.name,
				type: feature.type,
			})),
			now: { epoch_ms: now, iso: new Date(now).toISOString() },
			plans: fullProducts.map((product) => compactPlan({ features, product })),
		},
		fullCustomer,
	};
};

export type GenerationContext = Awaited<
	ReturnType<typeof setupGenerationContext>
>["context"];
