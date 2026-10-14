import {
	type ApiPlanExpandedV1,
	type ApiPlanV1,
	AppEnv,
	type Feature,
	type FullCustomer,
	type FullProduct,
	type FullProductToApiPlanParams,
	fullProductToApiPlan,
	type RevenueCatPlanMapping,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "../../ProductService.js";
import { buildCustomerEligibility } from "./buildCustomerEligibility.js";

type GetPlanResponseArgs = Omit<
	FullProductToApiPlanParams,
	"ctx" | "customerEligibility"
> & {
	ctx?: AutumnContext;
	features: Feature[];
	expand?: string[];
	fullCus?: FullCustomer;
	resolveBaseFullProduct?: boolean;
	revenuecatMapping?: RevenueCatPlanMapping | null;
};

const fetchBaseFullProduct = async ({
	ctx,
	product,
}: {
	ctx?: AutumnContext;
	product: FullProduct;
}): Promise<FullProduct | undefined> => {
	if (!ctx || !product.base_internal_product_id) return undefined;
	return (
		(await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: product.base_internal_product_id,
			orgId: ctx.org.id,
			env: ctx.env,
			allowNotFound: true,
		})) ?? undefined
	);
};

const toRevenuecatMappings = ({
	product,
	revenuecatMapping,
	revenuecatMappings,
}: Pick<
	GetPlanResponseArgs,
	"product" | "revenuecatMapping" | "revenuecatMappings"
>): ReadonlyMap<string, RevenueCatPlanMapping> | undefined => {
	if (!revenuecatMapping) return revenuecatMappings;
	return new Map([
		...(revenuecatMappings ?? []),
		[product.id, revenuecatMapping],
	]);
};

export async function getPlanResponse(
	args: GetPlanResponseArgs & { expandLicensePlans: true },
): Promise<ApiPlanExpandedV1>;
export async function getPlanResponse(
	args: GetPlanResponseArgs & { expandVariants: true },
): Promise<ApiPlanExpandedV1>;
export async function getPlanResponse(
	args: GetPlanResponseArgs & {
		expandLicensePlans?: false;
		expandVariants?: false;
	},
): Promise<ApiPlanV1>;
export async function getPlanResponse(
	args: GetPlanResponseArgs,
): Promise<ApiPlanV1 | ApiPlanExpandedV1>;
export async function getPlanResponse({
	ctx,
	features,
	expand = [],
	fullCus,
	resolveBaseFullProduct = true,
	revenuecatMapping,
	revenuecatMappings,
	...params
}: GetPlanResponseArgs): Promise<ApiPlanV1 | ApiPlanExpandedV1> {
	const { product, basePlan, baseFullProduct } = params;

	const customerEligibility = await buildCustomerEligibility({
		ctx,
		fullCus,
		fullProduct: product,
	});
	const hasBase = Boolean(basePlan ?? baseFullProduct);
	const fetchedBaseFullProduct =
		resolveBaseFullProduct && !hasBase
			? await fetchBaseFullProduct({ ctx, product })
			: undefined;

	return fullProductToApiPlan({
		...params,
		ctx: { features, expand, env: ctx?.env ?? AppEnv.Sandbox },
		customerEligibility,
		baseFullProduct: baseFullProduct ?? fetchedBaseFullProduct,
		revenuecatMappings: toRevenuecatMappings({
			product,
			revenuecatMapping,
			revenuecatMappings,
		}),
	});
}
