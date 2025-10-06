/**
 * Standard error responses for OpenAPI endpoints
 * Use this to keep error responses consistent across all endpoints
 */
export const standardErrorResponses = {
	"400": {
		description: "Bad Request",
		content: {
			"application/json": {
				schema: { $ref: "#/components/schemas/AutumnError" },
			},
		},
	},
	"401": {
		description: "Unauthorized",
		content: {
			"application/json": {
				schema: { $ref: "#/components/schemas/AutumnError" },
			},
		},
	},
	"404": {
		description: "Not Found",
		content: {
			"application/json": {
				schema: { $ref: "#/components/schemas/AutumnError" },
			},
		},
	},
	"500": {
		description: "Internal Server Error",
		content: {
			"application/json": {
				schema: { $ref: "#/components/schemas/AutumnError" },
			},
		},
	},
} as const;

/**
 * Merge standard error responses with custom success responses
 */
export function withErrorResponses<T extends Record<string, unknown>>(
	successResponses: T,
) {
	return {
		...successResponses,
		...standardErrorResponses,
	};
}
