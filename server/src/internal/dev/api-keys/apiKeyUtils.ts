import crypto from "node:crypto";
import { type ApiKey, AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import { ApiKeyService } from "../ApiKeyService.js";
import {
	clearSecretKeyCache,
	getCachedSecretKeyVerification,
	SECRET_KEY_CACHE_TTL_SECONDS,
	setCachedSecretKeyVerification,
} from "./cacheApiKeyUtils.js";

export enum ApiKeyPrefix {
	Sandbox = "am_sk_test",
	Live = "am_sk_live",
}

function generateApiKey(length = 32, prefix = "") {
	try {
		// Define allowed characters (alphanumeric only)
		const allowedChars =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);

		// Convert random bytes to alphanumeric string
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
	expiresAt,
}: {
	db: DrizzleCli;
	env: AppEnv;
	name: string;
	orgId: string;
	prefix: string;
	meta: Record<string, unknown>;
	userId?: string;
	expiresAt?: number | null;
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
		expires_at: expiresAt ?? null,
	};

	await ApiKeyService.insert({ db, apiKey: apiKeyData });

	return apiKey;
};

export const createHardcodedKey = async ({
	db,
	env,
	name,
	orgId,
	hardcodedKey,
	meta,
}: {
	db: DrizzleCli;
	env: AppEnv;
	name: string;
	orgId: string;
	hardcodedKey: string;
	meta: Record<string, unknown>;
}): Promise<{ key: string; alreadyExists: boolean }> => {
	const hashedKey = hashApiKey(hardcodedKey);

	// Check if key already exists
	const existing = await ApiKeyService.verifyAndFetch({
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
		expires_at: null,
	};

	await ApiKeyService.insert({ db, apiKey: apiKeyData });

	return { key: hardcodedKey, alreadyExists: false };
};

export const verifyKey = async ({
	db,
	key,
}: {
	db: DrizzleCli;
	key: string;
}) => {
	const hashedKey = hashApiKey(key);

	const env = key.startsWith(ApiKeyPrefix.Sandbox)
		? AppEnv.Sandbox
		: AppEnv.Live;

	const cached = await getCachedSecretKeyVerification<
		Awaited<ReturnType<typeof ApiKeyService.verifyAndFetch>>
	>({
		hashedKey,
	});

	if (cached) {
		if (cached.expiresAt && cached.expiresAt <= Date.now()) {
			await clearSecretKeyCache({ hashedKey });
			return { valid: false, data: null };
		}
		return { valid: true, data: cached };
	}

	const data = await ApiKeyService.verifyAndFetch({
		db,
		hashedKey,
		env,
	});

	if (!data) {
		return {
			valid: false,
			data: null,
		};
	}

	if (data.expiresAt && data.expiresAt <= Date.now()) {
		return { valid: false, data: null };
	}

	let ttl = SECRET_KEY_CACHE_TTL_SECONDS;
	if (data.expiresAt) {
		const secondsUntilExpiry = Math.max(
			0,
			Math.floor((data.expiresAt - Date.now()) / 1000),
		);
		ttl = Math.min(ttl, secondsUntilExpiry);
	}

	if (ttl > 0) {
		await setCachedSecretKeyVerification({
			hashedKey,
			data,
			ttl,
		});
	}

	return {
		valid: true,
		data: data,
	};
};
