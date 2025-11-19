import type { Context } from "hono";
import {
	parseCustomerIdFromBody,
	parseCustomerIdFromUrl,
} from "../../honoMiddlewares/analyticsMiddleware";
import { matchRoute } from "../../honoMiddlewares/middlewareUtils";
import type { HonoEnv } from "../../honoUtils/HonoEnv";
import {
	checkRateLimiter,
	generalRateLimiter,
	RateLimitType,
	trackRateLimiter,
} from "./initUpstash";

export const getRateLimitType = (c: Context<HonoEnv>) => {
	const method = c.req.method;
	const path = c.req.path;

	// Exact match patterns for track endpoints
	const trackPatterns = [
		{
			method: "POST",
			url: "/v1/events",
		},
		{
			method: "POST",
			url: "/v1/track",
		},
	];

	// Patterns for check endpoints (including dynamic customer_id)
	const checkPatterns = [
		{
			method: "POST",
			url: "/v1/check",
		},
		{
			method: "POST",
			url: "/v1/entitled",
		},
	];

	const getCustomerPatterns = [
		{
			method: "GET",
			url: "/v1/customers/:customer_id",
		},
		{
			method: "POST",
			url: "/v1/customers",
		},
	];

	if (
		trackPatterns.some((pattern) => matchRoute({ url: path, method, pattern }))
	) {
		return RateLimitType.Track;
	}

	if (
		checkPatterns.some((pattern) =>
			matchRoute({ url: path, method, pattern }),
		) ||
		getCustomerPatterns.some((pattern) =>
			matchRoute({ url: path, method, pattern }),
		)
	) {
		return RateLimitType.Check;
	}

	return RateLimitType.General;
};

export const getRateLimiter = ({
	rateLimitType,
}: {
	rateLimitType: RateLimitType;
}) => {
	switch (rateLimitType) {
		case RateLimitType.Track:
			return trackRateLimiter;
		case RateLimitType.Check:
			return checkRateLimiter;
		case RateLimitType.General:
			return generalRateLimiter;
	}
};

export const getRateLimitKey = async ({
	c,
	rateLimitType,
}: {
	c: Context<HonoEnv>;
	rateLimitType: RateLimitType;
}) => {
	const ctx = c.get("ctx");
	const orgId = ctx.org?.id;
	const env = ctx.env;
	// 1. If rate limit type is general
	switch (rateLimitType) {
		case RateLimitType.Track: {
			const res = await parseCustomerIdFromBody(c);
			const customerId = res?.customerId;
			return `track:${orgId}:${env}:${customerId}`;
		}

		case RateLimitType.Check: {
			const res = await parseCustomerIdFromBody(c);
			const urlCustomerId = parseCustomerIdFromUrl({ url: c.req.path });

			const customerId = res?.customerId || urlCustomerId;
			const sendEvent = res?.sendEvent;

			if (customerId && sendEvent) {
				return `track:${orgId}:${env}:${customerId}`;
			}

			return `check:${orgId}:${env}:${customerId}`;
		}

		case RateLimitType.General:
			return `general:${orgId}:${env}`;
	}
};
