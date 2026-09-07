import type { Feature, FeatureMarkupsOverride } from "@autumn/shared";
import {
	type CreditSystemFormValues,
	useCreditSystemForm,
} from "./useCreditSystemForm";

/** Binds the feature-level AI editor to a plan item's markup override by
 * presenting the override as the feature it overrides. */
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
