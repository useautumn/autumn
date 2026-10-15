import type {
	BalanceCreateFacts,
	BalanceUpdateFacts,
} from "../../facts/balanceFacts";
import { booleanField } from "../fields/booleanField";
import { customerField } from "../fields/customerField";
import { nullableObjectField } from "../fields/nullableObjectField";
import { numberField } from "../fields/numberField";
import { relativeDateField } from "../fields/relativeDateField";
import { stringField } from "../fields/stringField";
import type { WhenFields } from "../whenFieldTypes";

type ResetFacts = NonNullable<BalanceCreateFacts["reset"]>;

export const balanceCreateFields: WhenFields<BalanceCreateFacts> = {
	customer: customerField({ read: (facts) => facts.customer }),
	feature_id: stringField({
		label: "Feature",
		read: (facts) => facts.feature_id,
	}),
	included_grant: numberField({
		label: "Amount",
		read: (facts) => facts.included_grant,
	}),
	unlimited: booleanField({
		label: "Unlimited",
		read: (facts) => facts.unlimited,
	}),
	expires_at: relativeDateField({
		label: "Expires within",
		read: (facts) => facts.expires_at,
	}),
	reset: nullableObjectField<BalanceCreateFacts, ResetFacts>({
		label: "Reset interval",
		read: (facts) => facts.reset,
		fields: {
			interval: stringField({
				label: "Reset interval",
				read: (reset) => reset.interval,
			}),
		},
		describeValue: (reset) => reset.interval,
	}),
};

export const balanceUpdateFields: WhenFields<BalanceUpdateFacts> = {
	customer: customerField({ read: (facts) => facts.customer }),
	feature_id: stringField({
		label: "Feature",
		read: (facts) => facts.feature_id,
	}),
	included_grant: numberField({
		label: "Amount",
		read: (facts) => facts.included_grant,
	}),
	add_to_balance: numberField({
		label: "Add to balance",
		read: (facts) => facts.add_to_balance,
	}),
	remaining: numberField({
		label: "Remaining",
		read: (facts) => facts.remaining,
	}),
	usage: numberField({ label: "Usage", read: (facts) => facts.usage }),
};
