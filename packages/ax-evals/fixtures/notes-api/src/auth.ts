/** Fake auth: every request is this signed-in user (a real app would read a
 * session). Do not change — tests depend on the id. */
export type SessionUser = { id: string; name: string; email: string };

export const getUser = (): SessionUser => ({
	id: "user_123",
	name: "Ada Lovelace",
	email: "ada@acme.dev",
});
