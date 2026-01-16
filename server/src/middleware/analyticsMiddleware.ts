import { addAppContextToLogs } from "@/utils/logging/addContextToLogs";

const handleResFinish = (req: any, res: any) => {
	const skipUrls = ["/v1/customers/all/search"];

	try {
		if (skipUrls.includes(req.originalUrl)) {
			return;
		}

		if (process.env.NODE_ENV !== "development") {
			req.logger.info(
				`[${res.statusCode}] ${req.method} ${req.originalUrl} (${req.org?.slug})`,
				{
					statusCode: res.statusCode,
					res: res.locals.responseBody,
				},
			);
		}
	} catch (error) {
		console.error("Failed to log response");
		console.error(error);
	}
};

const parseCustomerIdFromUrl = (url: string): string | undefined => {
	if (!url.startsWith("/v1")) {
		return undefined;
	}

	const cleanUrl = url.split("?")[0].replace(/^\/+|\/+$/g, "");
	const segments = cleanUrl.split("/");
	const customersIndex = segments.findIndex(
		(segment) => segment === "customers",
	);

	if (customersIndex !== -1 && segments[customersIndex + 1]) {
		return segments[customersIndex + 1];
	}

	return undefined;
};

export const analyticsMiddleware = async (req: any, res: any, next: any) => {
	const customerId =
		req?.body?.customer_id || parseCustomerIdFromUrl(req.originalUrl);

	if (req.span) {
		req.span.setAttributes({
			org_id: req.org?.id,
			org_slug: req.org?.slug,
			env: req.env,
			customer_id: customerId,
		});
	}

	req.logger = addAppContextToLogs({
		logger: req.logger,
		appContext: {
			org_id: req.org?.id,
			org_slug: req.org?.slug,
			env: req.env,
			customer_id: customerId,
			auth_type: req.authType,
			user_id: req.userId || null,
			user_email: req.user?.email || null,
			api_version: req.apiVersion?.semver,
		},
	});

	// Store JSON response
	const originalJson = res.json;

	res.json = function (body: any) {
		res.locals.responseBody = body;
		return originalJson.call(this, body);
	};

	res.on("finish", () => handleResFinish(req, res));

	next();
};
