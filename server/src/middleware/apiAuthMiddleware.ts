import { AuthType, ErrCode } from "@autumn/shared";
import { verifyKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { dashboardOrigins } from "@/utils/constants.js";
import RecaseError from "@/utils/errorUtils.js";
import { withOrgAuth } from "./authMiddleware.js";
import { verifyBearerPublishableKey } from "./publicAuthMiddleware.js";
import { trmnlAuthMiddleware, trmnlExclusions } from "./trmnlAuthMiddleware.js";

const maskApiKey = (apiKey: string) => {
	return apiKey.slice(0, 15) + apiKey.slice(15).replace(/./g, "*");
};

export const verifySecretKey = async (req: any, res: any, next: any) => {
	const authHeader = req.headers.authorization || req.headers.Authorization;

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		const origin = req.get("origin");
		if (dashboardOrigins.includes(origin)) {
			return withOrgAuth(req, res, next);
		} else {
			throw new RecaseError({
				message: "Secret key not found in Authorization header",
				code: ErrCode.NoSecretKey,
				statusCode: 401,
			});
		}
	}

	const apiKey = authHeader.split(" ")[1];

	if (!apiKey.startsWith("am_")) {
		throw new RecaseError({
			message: "Invalid secret key",
			code: ErrCode.InvalidSecretKey,
			statusCode: 401,
		});
	}

	if (apiKey.startsWith("am_pk")) {
		console.log("Verifying publishable key");
		return await verifyBearerPublishableKey(apiKey, req, res, next);
	}

	const { valid, data } = await verifyKey({
		db: req.db,
		key: apiKey,
	});

	if (!valid || !data) {
		throw new RecaseError({
			message: "Invalid secret key",
			code: ErrCode.InvalidSecretKey,
			statusCode: 401,
		});
	}

	const { org, features, env, userId } = data;
	req.orgId = org.id;
	req.env = env;
	req.minOrg = {
		id: org.id,
		slug: org.slug,
	};
	req.org = org;
	req.features = features;
	req.authType = AuthType.SecretKey;
	req.userId = userId;

	const orgConfig = await req.headers["org-config"];
	if (orgConfig) {
		console.log("Org config found!: ", orgConfig);
		const newConfigFields = JSON.parse(orgConfig);
		try {
			req.org.config = {
				...org.config,
				...newConfigFields,
			};
		} catch {
			// Ignore parsing errors
		}
	}

	next();
};

export const apiAuthMiddleware = async (req: any, res: any, next: any) => {
	const logger = req.logger;

	if (trmnlExclusions.includes(req.path)) {
		logger.info(
			`exluding TRMNL from auth middleware for device with ID ${req.headers["x-trmnl-id"] || "unknown"}`,
		);
		return await trmnlAuthMiddleware(req, res, next);
	}

	try {
		await verifySecretKey(req, res, next);

		return;
	} catch (error: any) {
		if (error instanceof RecaseError) {
			if (error.code === ErrCode.InvalidSecretKey) {
				const apiKey = req.headers["authorization"]?.split(" ")[1];
				error.message = `Invalid secret key: ${maskApiKey(apiKey)}`;
			}

			logger.warn(`auth warning: ${error.message}`);

			res.status(error.statusCode).json({
				message: error.message,
				code: error.code,
			});
		} else {
			logger.error(`auth error: ${error.message}`, {
				error,
			});
			res.status(500).json({
				message: `Failed to verify secret key: ${error.message}`,
				code: ErrCode.InternalError,
			});
		}

		return;
	}
};
