import {
	type CatalogRow,
	type CustomerState,
	customerRowsToCustomerState,
	type MeteringIdentity,
	parseInitializeCommand,
} from "@autumn/balance-engine";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { initializeSubject } from "../../../actions/initializeSubject.js";
import { SubjectNotFoundError } from "../../subjectErrors.js";
import type { SubjectScope } from "../../types/subject.js";

const envelopeToCatalogRows = ({
	envelope,
}: {
	envelope: SubjectRowsEnvelope;
}): CatalogRow[] => [
	...envelope.entitlements.map(
		(row): CatalogRow => ({ table: "entitlements", row }),
	),
	...envelope.products.map((row): CatalogRow => ({ table: "products", row })),
	...envelope.features.map((row): CatalogRow => ({ table: "features", row })),
];

/** Reads the customer from Postgres and makes its rows the revision-zero baseline. */
export const hydrateSubjectState = async ({
	scope,
	identity,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
}): Promise<CustomerState> => {
	const { ctx } = scope;
	const occurredAt = ctx.receiptPolicy.now();
	const envelope = await ctx.db.getSubjectRows({
		identity,
		asOfTimestampMs: occurredAt,
	});
	if (!envelope) throw new SubjectNotFoundError({ identity });

	const command = parseInitializeCommand({
		input: {
			schemaVersion: 1,
			type: "initialize",
			commandId: `hydrate_${crypto.randomUUID()}`,
			requestId: `hydrate_${identity.customerId}`,
			identity,
			// The customer view: its identity names no entity even when the command's does.
			state: customerRowsToCustomerState({
				identity: { ...identity, entityId: null },
				customerProducts: envelope.customer_products,
				customerEntitlements: envelope.customer_entitlements,
				rollovers: envelope.rollovers,
				entities: envelope.entities,
			}),
			catalogRows: envelopeToCatalogRows({ envelope }),
			occurredAt,
		},
	});
	const decision = await initializeSubject({ ctx, command });
	// A server initialize may have landed first; either way the committed state is what the command runs on.
	if (decision.kind === "already_initialized") {
		const state = ctx.writer.readFreshestState({ identity });
		if (state) return state;
		throw new SubjectNotFoundError({ identity });
	}
	return decision.state;
};
