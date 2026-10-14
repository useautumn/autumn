import crypto from "node:crypto";
import type { ApiKey, AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import { apiKeyRepo } from "../repos/index.js";

export enum ApiKeyPrefix {
	Sandbox = "am_sk_test",
	Live = "am_sk_live",
}

function generateApiKey(length = 32, prefix = "") {
	try {
		const allowedChars =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);

		const key = Array.from(array)
			.map((byte) => allowedChars[byte % allowedChars.length])
			.join("");

		return prefix ? `${prefix}_${key}` : key;
	} catch (error) {
		console.error("Failed to generate API key:", error);
		throw new Error("Failed to generate secure API key");
	}
}

export const hashApiKey = (apiKey: string) => {
	return crypto.createHash("sha256").update(apiKey).digest("hex");
};

export const createKey = async ({
	db,
	env,
	name,
	userId,
	orgId,
	prefix,
	meta,
	scopes,
}: {
	db: Pick<DrizzleCli, "insert">;
	env: AppEnv;
	name: string;
	orgId: string;
	prefix: string;
	meta: Record<string, unknown>;
	userId?: string;
	scopes?: string[] | null;
}) => {
	const apiKey = generateApiKey(42, prefix);
	const hashedKey = hashApiKey(apiKey);

	const apiKeyData: ApiKey = {
		id: generateId("key"),
		org_id: orgId,
		user_id: userId || null,
		name,
		prefix: apiKey.substring(0, 14),
		created_at: Date.now(),
		env,
		hashed_key: hashedKey,
		meta,
		scopes: scopes ?? null,
	};

	await apiKeyRepo.insert({ db, apiKey: apiKeyData });

	return apiKey;
};

export const createHardcodedKey = async ({
	db,
	env,
	name,
	orgId,
	hardcodedKey,
	meta,
	scopes,
}: {
	db: DrizzleCli;
	env: AppEnv;
	name: string;
	orgId: string;
	hardcodedKey: string;
	meta: Record<string, unknown>;
	scopes?: string[];
}): Promise<{ key: string; alreadyExists: boolean }> => {
	const hashedKey = hashApiKey(hardcodedKey);

	const existing = await apiKeyRepo.getVerificationData({
		db,
		hashedKey,
		env,
	});

	if (existing) {
		return { key: hardcodedKey, alreadyExists: true };
	}

	const apiKeyData: ApiKey = {
		id: generateId("key"),
		org_id: orgId,
		user_id: null,
		name,
		prefix: hardcodedKey.substring(0, 14),
		created_at: Date.now(),
		env,
		hashed_key: hashedKey,
		meta,
		scopes: scopes ?? null,
	};

	await apiKeyRepo.insert({ db, apiKey: apiKeyData });

	return { key: hardcodedKey, alreadyExists: false };
};
