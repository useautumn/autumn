import type { Feature, FeatureMarkupsOverride } from "@autumn/shared";
import {
	type CreditSystemFormValues,
	useCreditSystemForm,
} from "./useCreditSystemForm";

/**
 * The feature-level AI editor bound to a plan item's markup override, so both
 * surfaces run the same form and component.
 *
 * The editor reads its values off a credit-system feature, so the override is
 * presented as one: the feature's identity with the override's markups.
 */
export const useMarkupsOverrideForm = ({
	creditSystem,
	markups,
	onChange,
}: {
	creditSystem?: Feature;
	markups?: FeatureMarkupsOverride;
	onChange: (markups: FeatureMarkupsOverride) => void;
}) =>
	useCreditSystemForm({
		feature: creditSystem
			? {
					...creditSystem,
					model_markups: markups?.model_markups ?? {},
					config: {
						...creditSystem.config,
						default_markup: markups?.default_markup ?? 0,
						provider_markups: markups?.provider_markups ?? {},
					},
				}
			: null,
		onChange: (values: CreditSystemFormValues) =>
			onChange({
				default_markup: values.defaultMarkup,
				provider_markups: values.provider_markups,
				model_markups: values.model_markups,
			}),
	});
