export type Actor = {
	userId: string;
	email: string;
	via: "session" | `api_key:${string}` | "system";
};
