import { createServer, Packet } from "dns2";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const OIDC_PORT = Number(process.env.MOCK_OIDC_PORT ?? 9090);
const DNS_PORT = Number(process.env.MOCK_DNS_PORT ?? 53535);
const issuer = `http://localhost:${OIDC_PORT}`;
const clientId = "autumn-local-sso";
const clientSecret = "autumn-local-secret";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const publicJwk = {
	...(await exportJWK(publicKey)),
	kid: "autumn-local",
	use: "sig",
	alg: "RS256",
};

type AuthorizationCode = {
	clientId: string;
	redirectUri: string;
	codeChallenge?: string;
	nonce?: string;
	email: string;
};

const codes = new Map<string, AuthorizationCode>();
const accessTokens = new Map<string, { email: string }>();
const txtRecords = new Map<string, string>();

const html = (body: string) =>
	new Response(
		`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Autumn SSO Test IdP</title><style>body{font-family:Inter,ui-sans-serif,system-ui;background:#f7f7f5;color:#171717;display:grid;min-height:100vh;place-items:center;margin:0}.card{width:min(440px,calc(100vw - 48px));background:white;border:1px solid #deded9;border-radius:16px;padding:28px;box-shadow:0 12px 32px #0000000d}h1{font-size:20px;margin:0 0 6px}p{color:#666;margin:0 0 22px;line-height:1.5}label{font-size:13px;font-weight:600;display:block;margin-bottom:7px}input{box-sizing:border-box;width:100%;padding:11px 12px;border:1px solid #cfcfc9;border-radius:8px;font:inherit;margin-bottom:16px}button{width:100%;border:0;border-radius:8px;padding:11px 14px;background:#171717;color:white;font:inherit;font-weight:600;cursor:pointer}.meta{margin-top:18px;font-size:12px;color:#888}.record{font-family:ui-monospace,monospace;background:#f1f1ed;padding:10px;border-radius:7px;word-break:break-all;margin-bottom:12px}</style></head><body>${body}</body></html>`,
		{ headers: { "content-type": "text/html; charset=utf-8" } },
	);

const base64Url = (bytes: ArrayBuffer) =>
	Buffer.from(bytes)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");

const app = Bun.serve({
	port: OIDC_PORT,
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === "/.well-known/openid-configuration") {
			return Response.json({
				issuer,
				authorization_endpoint: `${issuer}/authorize`,
				token_endpoint: `${issuer}/token`,
				userinfo_endpoint: `${issuer}/userinfo`,
				jwks_uri: `${issuer}/jwks`,
				response_types_supported: ["code"],
				subject_types_supported: ["public"],
				id_token_signing_alg_values_supported: ["RS256"],
				token_endpoint_auth_methods_supported: [
					"client_secret_post",
					"client_secret_basic",
				],
				scopes_supported: ["openid", "email", "profile"],
				claims_supported: ["sub", "email", "email_verified", "name"],
			});
		}

		if (url.pathname === "/jwks") {
			return Response.json({ keys: [publicJwk] });
		}

		if (url.pathname === "/authorize") {
			const params = Object.fromEntries(url.searchParams);
			const encoded = Buffer.from(JSON.stringify(params)).toString("base64url");
			return html(`<main class="card">
				<h1>Autumn test identity provider</h1>
				<p>This local IdP simulates the company login screen used by an OIDC provider.</p>
				<form method="post" action="/approve">
					<input type="hidden" name="request" value="${encoded}">
					<label for="email">Work email</label>
					<input id="email" name="email" type="email" value="owner@example.test" required>
					<button type="submit">Sign in with company SSO</button>
				</form>
				<div class="meta">Local test provider · no credentials leave this machine</div>
			</main>`);
		}

		if (url.pathname === "/approve" && request.method === "POST") {
			const form = await request.formData();
			const params = JSON.parse(
				Buffer.from(String(form.get("request")), "base64url").toString(),
			) as Record<string, string>;
			const code = crypto.randomUUID();
			codes.set(code, {
				clientId: params.client_id,
				redirectUri: params.redirect_uri,
				codeChallenge: params.code_challenge,
				nonce: params.nonce,
				email: String(form.get("email")).toLowerCase(),
			});
			const callback = new URL(params.redirect_uri);
			callback.searchParams.set("code", code);
			callback.searchParams.set("state", params.state);
			return Response.redirect(callback, 302);
		}

		if (url.pathname === "/token" && request.method === "POST") {
			const form = await request.formData();
			const code = String(form.get("code"));
			const stored = codes.get(code);
			if (!stored || String(form.get("redirect_uri")) !== stored.redirectUri) {
				return Response.json({ error: "invalid_grant" }, { status: 400 });
			}
			const authorization = request.headers.get("authorization");
			const basicSecret = authorization?.startsWith("Basic ")
				? Buffer.from(authorization.slice(6), "base64").toString().split(":")[1]
				: null;
			if (
				String(form.get("client_id") ?? stored.clientId) !== clientId ||
				String(form.get("client_secret") ?? basicSecret) !== clientSecret
			) {
				return Response.json({ error: "invalid_client" }, { status: 401 });
			}
			if (stored.codeChallenge) {
				const verifier = String(form.get("code_verifier") ?? "");
				const challenge = base64Url(
					await crypto.subtle.digest(
						"SHA-256",
						new TextEncoder().encode(verifier),
					),
				);
				if (challenge !== stored.codeChallenge) {
					return Response.json({ error: "invalid_grant" }, { status: 400 });
				}
			}

			codes.delete(code);
			const accessToken = crypto.randomUUID();
			accessTokens.set(accessToken, { email: stored.email });
			const now = Math.floor(Date.now() / 1000);
			const idToken = await new SignJWT({
				email: stored.email,
				email_verified: true,
				name: stored.email.split("@")[0],
				...(stored.nonce ? { nonce: stored.nonce } : {}),
			})
				.setProtectedHeader({ alg: "RS256", kid: "autumn-local" })
				.setIssuer(issuer)
				.setAudience(clientId)
				.setSubject(stored.email)
				.setIssuedAt(now)
				.setExpirationTime(now + 3600)
				.sign(privateKey);
			return Response.json({
				access_token: accessToken,
				token_type: "Bearer",
				expires_in: 3600,
				scope: "openid email profile",
				id_token: idToken,
			});
		}

		if (url.pathname === "/userinfo") {
			const token = request.headers
				.get("authorization")
				?.replace("Bearer ", "");
			const profile = token ? accessTokens.get(token) : null;
			if (!profile)
				return Response.json({ error: "invalid_token" }, { status: 401 });
			return Response.json({
				sub: profile.email,
				email: profile.email,
				email_verified: true,
				name: profile.email.split("@")[0],
			});
		}

		if (url.pathname === "/dns" && request.method === "POST") {
			const form = await request.formData();
			const host = String(form.get("host"))
				.trim()
				.toLowerCase()
				.replace(/\.$/, "");
			const value = String(form.get("value")).trim();
			txtRecords.set(host, value);
			return Response.redirect(`${issuer}/dns?saved=1`, 303);
		}

		if (url.pathname === "/dns") {
			const records = [...txtRecords.entries()]
				.map(
					([host, value]) =>
						`<div class="record"><strong>${host}</strong><br>${value}</div>`,
				)
				.join("");
			return html(`<main class="card">
				<h1>Local DNS TXT publisher</h1>
				<p>Paste the host and value shown by Autumn to simulate publishing a customer DNS record.</p>
				${url.searchParams.has("saved") ? "<p><strong>TXT record published.</strong></p>" : ""}
				${records}
				<form method="post" action="/dns">
					<label for="host">TXT host</label>
					<input id="host" name="host" required>
					<label for="value">TXT value</label>
					<input id="value" name="value" required>
					<button type="submit">Publish TXT record</button>
				</form>
				<div class="meta">DNS server: 127.0.0.1:${DNS_PORT}</div>
			</main>`);
		}

		return new Response("Not found", { status: 404 });
	},
});

const dnsServer = createServer({
	udp: true,
	handle(request, send) {
		const response = Packet.createResponseFromRequest(request);
		const question = request.questions[0];
		const name = question?.name.toLowerCase().replace(/\.$/, "");
		const value = name ? txtRecords.get(name) : null;
		if (question && question.type === Packet.TYPE.TXT && value) {
			response.answers.push({
				name: question.name,
				type: Packet.TYPE.TXT,
				class: Packet.CLASS.IN,
				ttl: 1,
				data: value,
			} as unknown as (typeof response.answers)[number]);
		} else {
			response.header.rcode = 3;
		}
		send(response);
	},
});

await dnsServer.listen({
	udp: { address: "127.0.0.1", port: DNS_PORT },
});

console.log(`Mock OIDC issuer: ${issuer}`);
console.log(`Mock DNS publisher: ${issuer}/dns`);
console.log(`Mock DNS resolver: 127.0.0.1:${DNS_PORT}`);

const shutdown = () => {
	dnsServer.close();
	app.stop();
	process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
