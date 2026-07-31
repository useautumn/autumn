import type { AppEnv, Organization } from "@autumn/shared";
import {
	escapeAplString,
	parseRestrictedApl,
	restrictedAplToApl,
} from "../../parser/restrictedApl.js";
import type { RestrictedAplStageKind } from "../../parser/restrictedAplConfig.js";

export type RequestLogsAplInput = {
	ctx: {
		org: Pick<Organization, "id" | "slug">;
		env: AppEnv;
	};
	query?: string;
	limit: number;
	allowedStages?: RestrictedAplStageKind[];
	appendDefaultOrder?: boolean;
};

type ProjectionField = {
	alias: string;
	expression: string;
};

const REQUEST_LOG_PROJECTION: ProjectionField[] = [
	{ alias: "timestamp", expression: "_time" },
	{ alias: "source", expression: "source" },
	{ alias: "status_code", expression: "statusCode" },
	{ alias: "request_method", expression: "['req.method']" },
	{ alias: "request_url", expression: "['req.url']" },
	{
		alias: "request_path",
		expression: "request_path",
	},
	{ alias: "request_body", expression: "['req.body']" },
	{ alias: "response_body", expression: "res" },
	{ alias: "org_id", expression: "['context.org_id']" },
	{ alias: "customer_id", expression: "['context.customer_id']" },
	{ alias: "entity_id", expression: "['context.entity_id']" },
	{ alias: "stripe_event_id", expression: "['stripe_event.id']" },
	{ alias: "stripe_event_type", expression: "['stripe_event.type']" },
	{ alias: "stripe_object_id", expression: "['stripe_event.object_id']" },
];

const tenantClauses = ({ ctx }: RequestLogsAplInput): string[] => [
	`| where ['context.org_id'] == '${escapeAplString(ctx.org.id)}'`,
	`| where ['context.org_slug'] == '${escapeAplString(ctx.org.slug)}'`,
	`| where (['context.env'] == '${escapeAplString(ctx.env)}' or env == '${escapeAplString(ctx.env)}')`,
];

const projectionStage = (): string =>
	`| project ${REQUEST_LOG_PROJECTION.map(
		({ alias, expression }) => `${alias} = ${expression}`,
	).join(", ")}`;

export const buildRequestLogsApl = (input: RequestLogsAplInput): string => {
	const ast = parseRestrictedApl({
		query: input.query,
		allowedStages: input.allowedStages,
	});
	const userStages = restrictedAplToApl(ast);
	const shouldAppendDefaultOrder =
		(input.appendDefaultOrder ?? true) &&
		!userStages.some((stage) => stage.startsWith("| order by "));

	return [
		"['express']",
		...tenantClauses(input),
		"| where isnotnull(statusCode)",
		"| where isnotnull(['req.url'])",
		"| extend request_path = tostring(parse_url(['req.url']).path)",
		"| extend source = case(request_path startswith '/v1', 'api_request', request_path startswith '/webhooks/connect/', 'stripe_webhook', request_path startswith '/webhooks/stripe/', 'stripe_webhook', '')",
		projectionStage(),
		"| where source in ('api_request', 'stripe_webhook')",
		...userStages,
		shouldAppendDefaultOrder ? "| order by timestamp desc" : null,
		`| limit ${input.limit}`,
	]
		.filter((line): line is string => Boolean(line))
		.join("\n");
};
