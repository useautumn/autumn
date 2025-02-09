import { AppEnv } from "../genModels.js";

export type ApiKey = {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  prefix: string;
  created_at: number;
  env: AppEnv;
  hashed_key: string;
  meta: any;
};
