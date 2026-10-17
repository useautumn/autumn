import { APPROVAL_FILTER_FIELD_LABELS } from "../../../schemas/filters/approvalFilterFieldLabels";
import type {
	FreeTrialFacts,
	IncomingPlanFacts,
} from "../../facts/billingFacts";
import { describeDuration } from "../format/describeDuration";
import { booleanField } from "./booleanField";
import { durationField } from "./durationField";
import { nullableObjectField } from "./nullableObjectField";
import { stringField } from "./stringField";

const labels = APPROVAL_FILTER_FIELD_LABELS.billing_change;

/** `null` = no trial. Any inner shape requires a trial, as in migrations. */
export const freeTrialField = () =>
	nullableObjectField<IncomingPlanFacts, FreeTrialFacts>({
		label: labels["incoming.free_trial"],
		read: (plan) => plan.free_trial,
		fields: {
			duration: durationField({
				label: labels["incoming.free_trial.duration"],
			}),
			card_required: booleanField({
				label: labels["incoming.free_trial.card_required"],
				read: (trial) => trial.card_required,
			}),
			on_end: stringField({
				label: labels["incoming.free_trial.on_end"],
				read: (trial) => trial.on_end,
			}),
		},
		describeValue: (trial) => describeDuration({ duration: trial.duration }),
	});
