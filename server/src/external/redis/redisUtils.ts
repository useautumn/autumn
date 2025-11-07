import { ErrCode } from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import { redis } from "./initRedis.js";

export const handleAttachRaceCondition = async ({
	req,
	res,
}: {
	req: any;
	res: any;
}) => {
	const customerId = req.body.customer_id;
	const orgId = req.orgId;
	const env = req.env;
	const lockKey = `attach_${customerId}_${orgId}_${env}`;

	console.log("Queue status:", redis.status);

	// Check if Redis is ready before attempting lock
	if (redis.status !== "ready") {
		req.logger.warn("❗️❗️ Redis not ready, proceeding without lock", {
			status: redis.status,
			customerId,
		});
		return null;
	}

	try {
		const existingLock = await redis.get(lockKey);

		if (existingLock) {
			throw new RecaseError({
				message: `Attach already runnning for customer ${customerId}, try again in a few seconds`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		// Create lock with 5 second timeout
		await redis.set(lockKey, "1", "PX", 5000, "NX");

		const originalJson = res.json;
		res.json = async function (body: any) {
			try {
				await clearLock({ lockKey, logger: req.logger });
			} catch (error) {
				req.logger.warn("❗️❗️ Error clearing lock", {
					error,
				});
			}
			originalJson.call(this, body);
		};

		return lockKey;
	} catch (error) {
		// Only throw if it's a lock conflict error
		if (error instanceof RecaseError) {
			throw error;
		}

		// Redis is down - log warning but allow operation to proceed
		req.logger.warn("❗️❗️ Redis unavailable, proceeding without lock", {
			error,
			customerId,
		});
		return null;
	}
};

export const handleCustomerRaceCondition = async ({
	action,
	customerId,
	orgId,
	env,
	res,
	logger,
}: {
	action: any;
	customerId: string;
	orgId: string;
	env: string;
	res: any;
	logger: any;
}) => {
	const lockKey = `${action}_${customerId}_${orgId}_${env}`;

	// Check if Redis is ready before attempting lock
	if (redis.status !== "ready") {
		logger.warn("❗️❗️ Redis not ready, proceeding without lock", {
			status: redis.status,
			action,
			customerId,
		});
		return null;
	}

	try {
		const existingLock = await redis.get(lockKey);
		if (existingLock) {
			throw new RecaseError({
				message: `Action ${action} already running for customer ${customerId}, try again in a few seconds`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		// Create lock with 5 second timeout
		await redis.set(lockKey, "1", "PX", 5000, "NX");

		const originalJson = res.json;
		res.json = async function (body: any) {
			try {
				await clearLock({ lockKey, logger });
			} catch (error) {
				logger.warn("❗️❗️ Error clearing lock", {
					error,
				});
			}
			originalJson.call(this, body);
		};

		return lockKey;
	} catch (error) {
		// Only throw if it's a lock conflict error
		if (error instanceof RecaseError) {
			throw error;
		}

		// Redis is down - log warning but allow operation to proceed
		logger.warn("❗️❗️ Redis unavailable, proceeding without lock", {
			error,
			action,
			customerId,
		});
		return null;
	}
};

export const clearLock = async ({
	lockKey,
	logger,
}: {
	lockKey: string;
	logger: any;
}) => {
	if (redis.status !== "ready") {
		logger.warn("❗️❗️ Redis not ready, skipping lock clear", {
			status: redis.status,
			lockKey,
		});
		return;
	}

	try {
		await redis.del(lockKey);
	} catch (error) {
		logger.warn("❗️❗️ Error clearing lock");
		logger.warn(error);
	}
};
