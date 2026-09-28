import type { AppEnv } from "../genModels/genEnums.js";

export type ApiKey = {
	id: string;
	org_id: string;
	user_id: string | null;
	name: string;
	prefix: string;
	created_at: number;
	env: AppEnv;
	hashed_key: string;
	meta: any;
	scopes: string[] | null;
};

export type ApiKeyListItem = Pick<
	ApiKey,
	"id" | "name" | "prefix" | "created_at" | "env" | "meta" | "scopes"
>;
