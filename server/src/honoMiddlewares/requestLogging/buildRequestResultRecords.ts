type RequestResultRecordParams = {
	requestId: string;
	requestMethod: string;
	requestPath: string;
	requestBody: unknown;
	orgId: string | null;
	customerId: string | null;
	entityId: string | null;
	environment: string;
	eventTime: string;
	statusCode: number;
	durationMs: number;
	responseBody: unknown;
	archiveSuccessResponse: boolean;
};

type AxiomRequestResultRecord = {
	statusCode: number;
	durationMs: number;
	responseBodyBytes: number;
	responseArchiveRouted: boolean;
	res: unknown;
};

type ArchivedRequestResultRecord = {
	log_destination: "request_log_archive";
	event_time: string;
	request_id: string;
	request_method: string;
	request_path: string;
	status_code: number;
	duration_ms: number;
	org_id: string | null;
	customer_id: string | null;
	entity_id: string | null;
	environment: string;
	request_body: string;
	response_body: string;
	response_body_bytes: number;
};

const RESPONSE_SUMMARY_KEYS = [
	"allowed",
	"code",
	"status",
	"success",
	"id",
	"customer_id",
	"entity_id",
] as const;

const BALANCE_SUMMARY_KEYS = [
	"granted",
	"remaining",
	"usage",
	"unlimited",
	"overage_allowed",
	"next_reset_at",
] as const;

const serializeBody = ({ body }: { body: unknown }): string =>
	JSON.stringify(body ?? null);

const isSummaryValue = (value: unknown) =>
	typeof value === "boolean" ||
	typeof value === "number" ||
	(typeof value === "string" && value.length <= 256);

const buildResponseSummary = ({
	responseBody,
}: {
	responseBody: unknown;
}): Record<string, unknown> | null => {
	if (
		!responseBody ||
		typeof responseBody !== "object" ||
		Array.isArray(responseBody)
	) {
		return null;
	}

	const response = responseBody as Record<string, unknown>;
	const summary = Object.fromEntries(
		RESPONSE_SUMMARY_KEYS.flatMap((key) =>
			isSummaryValue(response[key]) ? [[key, response[key]]] : [],
		),
	);
	const balance = response.balance;
	if (balance && typeof balance === "object" && !Array.isArray(balance)) {
		const balanceRecord = balance as Record<string, unknown>;
		const balanceSummary = Object.fromEntries(
			BALANCE_SUMMARY_KEYS.flatMap((key) =>
				isSummaryValue(balanceRecord[key]) ? [[key, balanceRecord[key]]] : [],
			),
		);
		if (Object.keys(balanceSummary).length > 0) {
			summary.balance = balanceSummary;
		}
	}

	return Object.keys(summary).length > 0 ? summary : null;
};

export const buildRequestResultRecords = ({
	requestId,
	requestMethod,
	requestPath,
	requestBody,
	orgId,
	customerId,
	entityId,
	environment,
	eventTime,
	statusCode,
	durationMs,
	responseBody,
	archiveSuccessResponse,
}: RequestResultRecordParams): {
	axiom: AxiomRequestResultRecord;
	archive: ArchivedRequestResultRecord | null;
} => {
	const serializedResponseBody = serializeBody({ body: responseBody });
	const responseBodyBytes = Buffer.byteLength(serializedResponseBody);
	const isSuccess = statusCode >= 200 && statusCode < 300;
	const responseArchiveRouted = isSuccess && archiveSuccessResponse;

	return {
		axiom: {
			statusCode,
			durationMs,
			responseBodyBytes,
			responseArchiveRouted,
			res:
				!isSuccess || !responseArchiveRouted
					? (responseBody ?? null)
					: buildResponseSummary({ responseBody }),
		},
		archive: responseArchiveRouted
			? {
					log_destination: "request_log_archive",
					event_time: eventTime,
					request_id: requestId,
					request_method: requestMethod,
					request_path: requestPath,
					status_code: statusCode,
					duration_ms: durationMs,
					org_id: orgId,
					customer_id: customerId,
					entity_id: entityId,
					environment,
					request_body: serializeBody({ body: requestBody }),
					response_body: serializedResponseBody,
					response_body_bytes: responseBodyBytes,
				}
			: null,
	};
};
