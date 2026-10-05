import { describe, expect, test } from "bun:test";
import { startAgentIdSignIn } from "@/internal/auth/agentId/startAgentIdSignIn.js";

const API_URL = "https://api.example.com";
const CLIENT_URL = "https://app.example.com";
const AGENTID_URL = "https://auth.agentid.com/v0/authorize?state=abc";

const captureHandler = (response: Response) => {
	const calls: Request[] = [];
	const authHandler = async (request: Request) => {
		calls.push(request);
		return response;
	};
	return { calls, authHandler };
};

describe("startAgentIdSignIn", () => {
	test("starts the AgentID OAuth sign-in and lands the agent in the app", async () => {
		const { calls, authHandler } = captureHandler(
			Response.json({ url: AGENTID_URL, redirect: true }),
		);

		await startAgentIdSignIn({
			request: new Request(`${API_URL}/auth/agentid/login`),
			authHandler,
			apiUrl: API_URL,
			clientUrl: CLIENT_URL,
		});

		const [signIn] = calls;
		expect(signIn?.method).toBe("POST");
		expect(signIn?.url).toBe(`${API_URL}/api/auth/sign-in/oauth2`);
		expect(signIn?.headers.get("origin")).toBe(CLIENT_URL);
		expect(await signIn?.json()).toEqual({
			providerId: "agentid",
			callbackURL: `${CLIENT_URL}/`,
			newUserCallbackURL: `${CLIENT_URL}/`,
			errorCallbackURL: `${CLIENT_URL}/sign-in`,
		});
	});

	test("redirects to AgentID and keeps the state cookies", async () => {
		const headers = new Headers({ "content-type": "application/json" });
		headers.append("set-cookie", "better-auth.state=s1; Path=/; HttpOnly");
		headers.append("set-cookie", "better-auth.pkce=p1; Path=/; HttpOnly");
		const { authHandler } = captureHandler(
			new Response(JSON.stringify({ url: AGENTID_URL, redirect: true }), {
				headers,
			}),
		);

		const response = await startAgentIdSignIn({
			request: new Request(`${API_URL}/auth/agentid/login`),
			authHandler,
			apiUrl: API_URL,
			clientUrl: CLIENT_URL,
		});

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(AGENTID_URL);
		expect(response.headers.getSetCookie()).toEqual([
			"better-auth.state=s1; Path=/; HttpOnly",
			"better-auth.pkce=p1; Path=/; HttpOnly",
		]);
	});

	test("passes Better Auth's error through when AgentID is not configured", async () => {
		const { authHandler } = captureHandler(
			Response.json({ message: "provider not found" }, { status: 400 }),
		);

		const response = await startAgentIdSignIn({
			request: new Request(`${API_URL}/auth/agentid/login`),
			authHandler,
			apiUrl: API_URL,
			clientUrl: CLIENT_URL,
		});

		expect(response.status).toBe(400);
		expect(response.headers.get("location")).toBeNull();
	});
});
