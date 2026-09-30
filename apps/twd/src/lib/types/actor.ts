/** Who performed an action: a signed-in human, or an API key acting for its owner. */
export type Actor = {
	userId: string;
	email: string;
	via: "session" | `api_key:${string}` | "system";
};
