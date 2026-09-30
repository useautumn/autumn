import { subjectStateToFullSubject } from "@autumn/balance-engine";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { freshestCatalog } from "./freshestCatalog.js";

/** The subject a request is decided on, as Autumn last sent it; null when Atom does not hold the customer. */
export const readCurrentSubject = ({
	ctx,
	customerId,
}: {
	ctx: SlotProcessorContext;
	customerId: string;
}): CurrentSubject | null => {
	const stored = ctx.sqliteStore.readSubject({ customerId, entityId: null });
	if (!stored) return null;

	const shared = ctx.catalogStore.read();
	const catalog = freshestCatalog({ stored, shared });
	return {
		fullSubject: subjectStateToFullSubject({
			state: stored.state,
			catalog,
			entityId: null,
		}),
		catalog,
		// The joined catalog already holds the freshest copy of each feature the customer references.
		features: Object.values({
			...shared?.catalog.features,
			...catalog.features,
		}),
		org: stored.org,
	};
};
