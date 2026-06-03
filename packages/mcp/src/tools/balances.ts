import { CreateBalanceParamsV0Schema } from "@autumn/shared/publicApiSchemas";
import { createDomainTools } from "./utils/builders.js";
import { epochMillisecondsSchema } from "./utils/dates.js";
import type { ToolDomain } from "./utils/types.js";

const createBalanceMcpSchema = CreateBalanceParamsV0Schema.extend({
	expires_at: epochMillisecondsSchema.optional().meta({
		description:
			"Expiry time as epoch milliseconds or an ISO date string. Date-only values use midnight UTC.",
	}),
});

const endpoints = {
	createBalance: "/v1/balances.create",
} as const;

const schemas = {
	previewCreateBalance: createBalanceMcpSchema,
	createBalance: createBalanceMcpSchema,
} as const;

const { operation, localPreview } = createDomainTools({ endpoints, schemas });

const domain = {
	operations: [
		operation({
			id: "createBalance",
			description:
				"Create a standalone customer balance grant. Use when a user asks to give, add, grant, or provision credits/balance to a customer or entity. Destructive: preview first; use entity_id for entity-scoped credits, included_grant for the grant amount, expires_at for expiring grants, and omit reset when using expires_at. For relative expiries like '2 months', use calendar months, not a 30-day approximation. expires_at accepts epoch milliseconds or ISO/date strings.",
			destructive: true,
		}),
	],
	localPreviews: [
		localPreview({
			id: "previewCreateBalance",
			description:
				"Preview a standalone balance grant before createBalance. Use when a user asks to give, add, grant, or provision credits/balance to a customer or entity. Use for one-time credit grants, referral/promotional credits, and entity-scoped credits. Does not mutate Autumn. For relative expiries like '2 months', use calendar months. expires_at accepts epoch milliseconds or ISO/date strings.",
			writeToolName: "createBalance",
			preview: (request) => ({
				action: "createBalance",
				request,
				impact:
					"Creates a standalone balance grant. If entity_id is present, the balance is scoped to that entity. If expires_at is present, the grant expires at that timestamp.",
			}),
		}),
	],
} satisfies ToolDomain;

export const balances = { endpoints, schemas, domain };
