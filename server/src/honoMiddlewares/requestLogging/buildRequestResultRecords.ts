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

const serializeBody = ({ body }: { body: unknown }): string =>
	JSON.stringify(body ?? null);

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
			res: responseBody ?? null,
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
