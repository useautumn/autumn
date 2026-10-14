export const RESTRICTED_APL_STAGE_KINDS = [
	"where",
	"orderBy",
	"limit",
	"summarize",
	"project",
] as const;

export type RestrictedAplStageKind =
	(typeof RESTRICTED_APL_STAGE_KINDS)[number];

export const DEFAULT_RESTRICTED_APL_STAGES: RestrictedAplStageKind[] = [
	"where",
	"orderBy",
	"limit",
];

export const RESTRICTED_APL_MAX_LIMIT = 200;

export const RESTRICTED_APL_MAX_NESTED_PATH_DEPTH = 4;

export const SAFE_APL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const RESTRICTED_APL_TOP_LEVEL_FIELDS = {
	timestamp: {
		apl: "timestamp",
		aliases: ["timestamp"],
	},
	source: {
		apl: "source",
		aliases: ["source"],
	},
	status_code: {
		apl: "status_code",
		aliases: ["status_code", "statusCode"],
	},
	request_method: {
		apl: "request_method",
		aliases: ["request_method", "method", "request.method"],
	},
	request_url: {
		apl: "request_url",
		aliases: ["request_url", "request.url", "url"],
	},
	request_path: {
		apl: "request_path",
		aliases: ["request_path", "request.path", "path"],
	},
	request_body: {
		apl: "request_body",
		aliases: ["request_body"],
	},
	response_body: {
		apl: "response_body",
		aliases: ["response_body"],
	},
	org_id: {
		apl: "org_id",
		aliases: ["org_id", "context.org_id"],
	},
	customer_id: {
		apl: "customer_id",
		aliases: ["customer_id", "context.customer_id"],
	},
	entity_id: {
		apl: "entity_id",
		aliases: ["entity_id", "context.entity_id"],
	},
	stripe_event_id: {
		apl: "stripe_event_id",
		aliases: ["stripe_event_id"],
	},
	stripe_event_type: {
		apl: "stripe_event_type",
		aliases: ["stripe_event_type"],
	},
	stripe_object_id: {
		apl: "stripe_object_id",
		aliases: ["stripe_object_id"],
	},
} as const;

export type RestrictedAplTopLevelField =
	keyof typeof RESTRICTED_APL_TOP_LEVEL_FIELDS;

export const RESTRICTED_APL_NESTED_ROOTS = {
	request_body: {
		apl: "request_body",
	},
	response_body: {
		apl: "response_body",
	},
} as const;

export type RestrictedAplNestedRoot = keyof typeof RESTRICTED_APL_NESTED_ROOTS;

export const RESTRICTED_APL_NUMERIC_AGGREGATE_FIELDS =
	new Set<RestrictedAplTopLevelField>(["status_code"]);

export const RESTRICTED_APL_DANGEROUS_TEXT_PATTERNS = [
	{
		pattern: /[;[\]{}]/,
		message: "Query contains unsupported syntax",
	},
	{
		pattern: /--|\/\/|\/\*|\*\//,
		message: "Query comments are not supported",
	},
] as const;

export const RESTRICTED_APL_FIELD_ALIASES = Object.fromEntries(
	Object.entries(RESTRICTED_APL_TOP_LEVEL_FIELDS).flatMap(([field, config]) =>
		config.aliases.map((alias) => [alias, field]),
	),
) as Record<string, RestrictedAplTopLevelField>;
