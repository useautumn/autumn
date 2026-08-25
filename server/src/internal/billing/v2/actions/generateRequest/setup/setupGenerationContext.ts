import type { Feature, FullCusProduct, FullProduct } from "@autumn/shared";
import {
	mapToProductV2,
	productV2ToApiPlanV1,
	toCreatePlanItemParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
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
		...(productV2.group ? { group: productV2.group } : {}),
		...(productV2.is_add_on ? { is_add_on: true } : {}),
		...(productV2.free_trial ? { free_trial: productV2.free_trial } : {}),
		...(apiPlan.price
			? {
					price: {
						amount: apiPlan.price.amount,
						interval: apiPlan.price.interval,
						...(apiPlan.price.interval_count &&
						apiPlan.price.interval_count !== 1
							? { interval_count: apiPlan.price.interval_count }
							: {}),
					},
				}
			: {}),
		items: apiPlan.items.map((item) => toCreatePlanItemParams(item)),
	};
};

const compactCustomerProduct = (customerProduct: FullCusProduct) => ({
	customer_product_id: customerProduct.id,
	plan_id: customerProduct.product.id,
	status: customerProduct.status,
	...(customerProduct.canceled ? { canceled: true } : {}),
	...(customerProduct.trial_ends_at
		? { trial_ends_at: customerProduct.trial_ends_at }
		: {}),
	...(customerProduct.options?.length
		? { prepaid_quantities: customerProduct.options }
		: {}),
});

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
		CusService.getFull({ ctx, idOrInternalId: customerId }),
	]);

	const now = Date.now();

	return {
		context: {
			customer: {
				id: fullCustomer.id,
				...(fullCustomer.name ? { name: fullCustomer.name } : {}),
				current_plans: fullCustomer.customer_products.map(
					compactCustomerProduct,
				),
				entities: (fullCustomer.entities ?? []).map((entity) => ({
					id: entity.id,
					...(entity.name ? { name: entity.name } : {}),
					...(entity.feature_id ? { feature_id: entity.feature_id } : {}),
				})),
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
