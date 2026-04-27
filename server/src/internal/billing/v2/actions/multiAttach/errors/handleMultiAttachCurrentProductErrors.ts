import type { MultiAttachProductContext } from "@autumn/shared";
import { validateImmediateMultiProductTransitions } from "../../common/immediateMultiProduct/validateImmediateMultiProductTransitions";

/** Validates transition constraints for multi-attach. */
export const handleMultiAttachCurrentProductErrors = ({
	productContexts,
}: {
	productContexts: MultiAttachProductContext[];
}) =>
	validateImmediateMultiProductTransitions({
		productContexts,
	});
