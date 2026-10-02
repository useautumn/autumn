import {
	type FullCusProduct,
	isCusProductOnEntity,
	type MultiAttachProductContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	customerProductToGrantedLicenses,
	customerProductToInstanceConfig,
	requestedPlanToInstanceConfig,
} from "../timeline/instanceConfig/instanceConfigs";
import { instanceConfigsMatch } from "../timeline/instanceConfig/instanceConfigsMatch";

type RequestedPlan = Pick<
	MultiAttachProductContext,
	"fullProduct" | "featureQuantities" | "customerLicenseQuantities"
>;

/** The requested plan is exactly this customer product: same scope, and the one config equality set_plans uses. */
export const isUnchangedCustomerProduct = ({
	ctx,
	customerProduct,
	productContext,
	internalEntityId,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	productContext: RequestedPlan;
	internalEntityId: string | undefined;
}) =>
	isCusProductOnEntity({ cusProduct: customerProduct, internalEntityId }) &&
	instanceConfigsMatch({
		features: ctx.features,
		first: customerProductToInstanceConfig({
			customerProduct,
			now: customerProduct.starts_at,
		}),
		second: requestedPlanToInstanceConfig({
			fullProduct: productContext.fullProduct,
			featureQuantities: productContext.featureQuantities,
			customerLicenseQuantities: productContext.customerLicenseQuantities,
			omittedLicenses: {
				type: "granted",
				licenses: customerProductToGrantedLicenses(customerProduct),
			},
			resetsBillingCycle: false,
		}),
	});
