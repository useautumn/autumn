import { generateId } from "@/utils/genUtils.js";
import { ApiKey, AppEnv } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { ApiKeyService } from "../ApiKeyService.js";

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

const hashApiKey = (apiKey: string) => {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
};

export const createKey = async ({
  sb,
  env,
  name,
  orgId,
  prefix,
  meta,
}: {
  sb: SupabaseClient;
  env: AppEnv;
  name: string;
  orgId: string;
  prefix: string;
  meta: any;
}) => {
  const apiKey = generateApiKey(42, prefix);
  const hashedKey = hashApiKey(apiKey);

  const apiKeyData: ApiKey = {
    id: generateId("key"),
    org_id: orgId,
    user_id: "",
    name,
    prefix: apiKey.substring(0, 14),
    created_at: Date.now(),
    env,
    hashed_key: hashedKey,
    meta,
  };

  await ApiKeyService.insert(sb, apiKeyData);

  return apiKey;
};

export const verifyKey = async ({
  sb,
  key,
}: {
  sb: SupabaseClient;
  key: string;
}) => {
  const hashedKey = hashApiKey(key);
  const apiKey = await ApiKeyService.getByHashedKey(sb, hashedKey);

  if (!apiKey) {
    return {
      valid: false,
      data: null,
    };
  }

  return {
    valid: true,
    data: apiKey,
  };
};

export const migrateKey = async ({
  sb,
  keyId,
  meta,
  apiKey,
}: {
  sb: SupabaseClient;
  keyId: string;
  meta: any;
  apiKey: string;
}) => {
  try {
    const hashedKey = hashApiKey(apiKey);

    await ApiKeyService.update({
      sb,
      update: {
        id: keyId,
        hashed_key: hashedKey,
        meta,
      },
      keyId,
    });

    console.log(`MIGRATED KEY FOR ${keyId}, ${meta.org_slug}`);
  } catch (error) {
    console.log(`ERROR: FAILED TO MIGRATE KEY FOR ${keyId}, ${meta.org_slug}`);
    console.log(error);
  }
};
