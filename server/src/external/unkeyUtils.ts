import { AppEnv } from "@autumn/shared";
import { Unkey } from "@unkey/api";

const UNKEY_API_ID = "api_2fcMv43jiAbBySAgDubovfpVUABP";
const createUnkeyCli = () => {
  return new Unkey({ rootKey: process.env.UNKEY_ROOT_KEY! });
};

export const createKey = async ({
  env,
  name,
  ownerId,
  prefix,
  meta,
}: {
  env: AppEnv;
  name: string;
  ownerId: string;
  prefix: string;
  meta: any;
}) => {
  const unkey = createUnkeyCli();
  const key = await unkey.keys.create({
    apiId: UNKEY_API_ID,
    name,
    prefix,
    ownerId,
    meta,
    environment: env,
  });
  return key;
};

export const updateKey = async (keyId: string, meta: any) => {
  const unkey = createUnkeyCli();
  await unkey.keys.update({
    keyId,
    meta,
  });
};

export const deleteKey = async (keyId: string) => {
  const unkey = createUnkeyCli();
  await unkey.keys.delete({ keyId });
};

export const validateApiKey = async (apiKey: string) => {
  const unkey = createUnkeyCli();
  const { result, error } = await unkey.keys.verify({
    apiId: UNKEY_API_ID,
    key: apiKey,
  });

  if (error || !result.valid) {
    throw new Error("Invalid API key");
  }

  return result;
};
