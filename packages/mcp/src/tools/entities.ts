import {
	CreateEntityParamsV1Schema,
	GetEntityParamsV0Schema,
	ListEntitiesV2_3ParamsSchema,
} from "@autumn/shared";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const endpoints = {
	createEntity: "/v1/entities.create",
	getEntity: "/v1/entities.get",
	listEntities: "/v1/entities.list",
} as const;

const schemas = {
	createEntity: CreateEntityParamsV1Schema,
	getEntity: GetEntityParamsV0Schema,
	listEntities: ListEntitiesV2_3ParamsSchema,
} as const;

const { operation } = createDomainTools({ endpoints, schemas });

const domain = {
	operations: [
		operation({
			id: "createEntity",
			description: `
- Create an entity under a customer.
- Create only after listEntities for the customer confirms the entity does not exist.
- Follow Billing Safety entity rules for entity-scoped billing.
			`.trim(),
			idempotent: true,
		}),
		operation({
			id: "listEntities",
			description: `
- List entities across the current org.
- Pass customer_id to list entities for one customer.
- Use before entity-scoped billing or balance work to resolve or verify entity ids.
			`.trim(),
		}),
		operation({
			id: "getEntity",
			description: `
- Fetch one entity by entity_id.
- Include customer_id when known to avoid lookup ambiguity.
			`.trim(),
		}),
	],
} satisfies ToolDomain;

export const entities = { endpoints, schemas, domain };
