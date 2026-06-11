import { resolveInheritedMarkup } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import type { CreditSystemFormInstance } from "./useCreditSystemForm";

/** Centralizes the default/provider markup store selectors and their inherited-markup resolution for a single provider. */
export const useProviderMarkup = (
	form: CreditSystemFormInstance,
	providerKey: string,
) => {
	const defaultMarkup = useStore(form.store, (s) => s.values.defaultMarkup);
	const providerMarkup = useStore(
		form.store,
		(s) => s.values.provider_markups[providerKey]?.markup,
	);
	const inheritedMarkup = resolveInheritedMarkup({
		providerMarkup,
		defaultMarkup,
	});

	return { defaultMarkup, providerMarkup, inheritedMarkup };
};
