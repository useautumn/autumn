export type SessionUser = { id: string; name: string; email: string };

export const getUser = (): SessionUser => ({
	id: "user_123",
	name: "Ada Lovelace",
	email: "ada@acme.dev",
});
