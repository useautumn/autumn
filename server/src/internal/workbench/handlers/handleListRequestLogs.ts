import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import {
	getAxiomClient,
	isAxiomConfigured,
} from "@/external/axiom/initAxiom.js";
import {
	buildRequestLogsQuery,
	type HttpMethodFilter,
	type StatusBucket,
} from "@/external/axiom/utils/aplUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";

const ListRequestLogsSchema = z.object({
	customer_id: z.string().min(1),
	method: z.enum(["all", "GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
	status: z.enum(["all", "2xx", "4xx", "5xx"]).optional(),
	search: z.string().optional(),
});

export interface RequestLogEntry {
	id: string;
	time: string;
	statusCode: number;
	durationMs: number | null;
	method: string | null;
	url: string | null;
	path: string | null;
	reqId: string | null;
	ip: string | null;
	userAgent: string | null;
	customerId: string | null;
	msg: string | null;
	raw: Record<string, unknown>;
}

const extractPath = (url: string | null | undefined): string | null => {
	if (!url) return null;
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
};

const pickString = (
	d: Record<string, unknown>,
	keys: string[],
): string | null => {
	for (const k of keys) {
		const v = d[k];
		if (typeof v === "string" && v.length > 0) return v;
	}
	return null;
};

const pickNumber = (
	d: Record<string, unknown>,
	keys: string[],
): number | null => {
	for (const k of keys) {
		const v = d[k];
		if (typeof v === "number") return v;
	}
	return null;
};

export const handleListRequestLogs = createRoute({
	scopes: [Scopes.Superuser],
	body: ListRequestLogsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env } = ctx;
		const { customer_id, method, status, search } = c.req.valid("json");

		const customer = await CusService.getFull({
			ctx,
			idOrInternalId: customer_id,
		});

		if (!customer) {
			throw new RecaseError({
				message: "Customer not found",
				code: ErrCode.CustomerNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		if (!isAxiomConfigured()) {
			return c.json({ logs: [], unconfigured: true });
		}

		const apl = buildRequestLogsQuery({
			orgSlug: org.slug,
			env,
			customerId: customer.id ?? customer_id,
			method: method as HttpMethodFilter | undefined,
			statusBucket: status as StatusBucket | undefined,
			search,
		});

		try {
			const axiom = getAxiomClient();
			const result = await axiom.query(apl);
			const matches = result.matches ?? [];

			const logs: RequestLogEntry[] = matches.map((entry, i) => {
				const raw = (entry.data ?? {}) as Record<string, unknown>;
				const url = pickString(raw, ["req.url", "url"]);
				return {
					id: pickString(raw, ["req.id", "reqId"]) ?? `${entry._time}-${i}`,
					time: entry._time,
					statusCode: pickNumber(raw, ["statusCode"]) ?? 0,
					durationMs: pickNumber(raw, ["durationMs"]),
					method: pickString(raw, ["req.method", "method"]),
					url,
					path: extractPath(url),
					reqId: pickString(raw, ["req.id", "reqId"]),
					ip: pickString(raw, ["req.ip_address"]),
					userAgent: pickString(raw, ["req.user_agent"]),
					customerId: pickString(raw, [
						"req.customer_id",
						"customer_id",
						"cusId",
					]),
					msg: pickString(raw, ["msg", "message"]),
					raw,
				};
			});

			return c.json({ logs });
		} catch (err) {
			ctx.logger?.error("Axiom workbench query failed", { err });
			throw new RecaseError({
				message: "Failed to query request logs",
				code: ErrCode.InternalError,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
			});
		}
	},
});
