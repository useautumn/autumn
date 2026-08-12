import type {
	ApiBalanceV1,
	ApiFlagV0,
	AutumnBillingPlan,
	CustomerPlanChange,
	FullCustomer,
	PreviewBalanceChange,
	PreviewFlagChange,
} from "@autumn/shared";
import { autumnBillingPlanToCustomerPlanChanges } from "./autumnBillingPlanToCustomerPlanChanges/autumnBillingPlanToCustomerPlanChanges";
import { buildBalanceChanges } from "./buildBalanceChanges/buildBalanceChanges";
import { buildFlagChanges } from "./buildBalanceChanges/buildFlagChanges";

export const buildBillingChanges = ({
	autumnBillingPlan,
	originalFullCustomer,
	beforeBalances = {},
	afterBalances = {},
	beforeFlags = {},
	afterFlags = {},
}: {
	autumnBillingPlan: AutumnBillingPlan;
	originalFullCustomer?: FullCustomer;
	beforeBalances?: Record<string, ApiBalanceV1>;
	afterBalances?: Record<string, ApiBalanceV1>;
	beforeFlags?: Record<string, ApiFlagV0>;
	afterFlags?: Record<string, ApiFlagV0>;
}): {
	planChanges: CustomerPlanChange[];
	balanceChanges: PreviewBalanceChange[];
	flagChanges: PreviewFlagChange[];
} => ({
	planChanges: autumnBillingPlanToCustomerPlanChanges({
		autumnBillingPlan,
		originalFullCustomer,
	}),
	balanceChanges: buildBalanceChanges({
		beforeBalances,
		afterBalances,
	}),
	flagChanges: buildFlagChanges({
		beforeFlags,
		afterFlags,
	}),
});
