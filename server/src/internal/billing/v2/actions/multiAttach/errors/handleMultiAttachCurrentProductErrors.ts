import type { MultiAttachProductContext } from "@autumn/shared";
import { validateImmediateMultiProductTransitions } from "../../common/immediateMultiProduct/validateImmediateMultiProductTransitions";

export const handleMultiAttachCurrentProductErrors = ({
	productContexts,
}: {
	productContexts: MultiAttachProductContext[];
}) =>
	validateImmediateMultiProductTransitions({
		productContexts,
	});
