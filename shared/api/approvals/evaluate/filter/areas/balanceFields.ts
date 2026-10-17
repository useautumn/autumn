import { APPROVAL_FILTER_FIELD_LABELS } from "../../../schemas/filters/approvalFilterFieldLabels";
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
import type { FilterFields } from "../filterFieldTypes";

type ResetFacts = NonNullable<BalanceCreateFacts["reset"]>;

const createLabels = APPROVAL_FILTER_FIELD_LABELS.balance_create;

export const balanceCreateFields: FilterFields<BalanceCreateFacts> = {
	customer: customerField({
		labels: createLabels,
		read: (facts) => facts.customer,
	}),
	feature_id: stringField({
		label: createLabels.feature_id,
		read: (facts) => facts.feature_id,
	}),
	included_grant: numberField({
		label: createLabels.included_grant,
		read: (facts) => facts.included_grant,
	}),
	unlimited: booleanField({
		label: createLabels.unlimited,
		read: (facts) => facts.unlimited,
	}),
	expires_at: relativeDateField({
		label: createLabels.expires_at,
		read: (facts) => facts.expires_at,
	}),
	reset: nullableObjectField<BalanceCreateFacts, ResetFacts>({
		label: createLabels.reset,
		read: (facts) => facts.reset,
		fields: {
			interval: stringField({
				label: createLabels["reset.interval"],
				read: (reset) => reset.interval,
			}),
		},
		describeValue: (reset) => reset.interval,
	}),
};

const updateLabels = APPROVAL_FILTER_FIELD_LABELS.balance_update;

export const balanceUpdateFields: FilterFields<BalanceUpdateFacts> = {
	customer: customerField({
		labels: updateLabels,
		read: (facts) => facts.customer,
	}),
	feature_id: stringField({
		label: updateLabels.feature_id,
		read: (facts) => facts.feature_id,
	}),
	included_grant: numberField({
		label: updateLabels.included_grant,
		read: (facts) => facts.included_grant,
	}),
	add_to_balance: numberField({
		label: updateLabels.add_to_balance,
		read: (facts) => facts.add_to_balance,
	}),
	remaining: numberField({
		label: updateLabels.remaining,
		read: (facts) => facts.remaining,
	}),
	usage: numberField({
		label: updateLabels.usage,
		read: (facts) => facts.usage,
	}),
};
