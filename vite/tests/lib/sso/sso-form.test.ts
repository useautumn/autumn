import { expect, test } from "bun:test";
import {
	buildSsoConnectionPayload,
	createSsoFormSchema,
	maskClientId,
	normalizeSsoDomain,
	validateSsoClientId,
	validateSsoClientSecret,
	validateSsoDomain,
	validateSsoIssuer,
} from "@/lib/sso/ssoForm";

const valid = {
	domain: "acme.com",
	issuer: "https://login.acme.com",
	clientId: "client-123",
	clientSecret: "secret-456",
};

test("normalizes pasted domains", () => {
	expect(normalizeSsoDomain("  Acme.com ")).toBe("acme.com");
	expect(normalizeSsoDomain("https://Acme.com/login")).toBe("acme.com");
	expect(normalizeSsoDomain("http://acme.com:8080/x?y=1")).toBe("acme.com");
	expect(normalizeSsoDomain("acme.com.")).toBe("acme.com");
	expect(normalizeSsoDomain("")).toBe("");
});

test("accepts a complete form", () => {
	expect(createSsoFormSchema().safeParse(valid).success).toBe(true);
});

test("requires a valid domain", () => {
	expect(validateSsoDomain("")).toBe("Enter your company domain.");
	expect(validateSsoDomain("acme")).toBe(
		"Enter a valid company domain, like acme.com.",
	);
	expect(validateSsoDomain("acme.com")).toBeNull();
});

test("requires an https issuer url", () => {
	expect(validateSsoIssuer("")).toBe("Enter the OIDC issuer URL.");
	expect(validateSsoIssuer("login.acme.com")).toBe(
		"Enter a valid issuer URL, like https://login.acme.com.",
	);
	expect(validateSsoIssuer("http://login.acme.com")).toBe(
		"The issuer URL must use https://.",
	);
	expect(validateSsoIssuer("https://login.acme.com")).toBeNull();
});

test("allows an insecure localhost issuer only when explicitly enabled", () => {
	const allowInsecureLocalhost = true;
	expect(
		validateSsoIssuer("http://localhost:9090", { allowInsecureLocalhost }),
	).toBeNull();
	expect(
		validateSsoIssuer("http://127.0.0.1:9090", { allowInsecureLocalhost }),
	).toBeNull();
	expect(
		validateSsoIssuer("http://login.acme.com", { allowInsecureLocalhost }),
	).toBe("The issuer URL must use https://.");
	expect(validateSsoIssuer("http://localhost:9090")).toBe(
		"The issuer URL must use https://.",
	);
});

test("requires client credentials", () => {
	expect(validateSsoClientId("  ")).toBe("Enter the OIDC client ID.");
	expect(validateSsoClientSecret("  ")).toBe("Enter the OIDC client secret.");
	expect(validateSsoClientId("client-123")).toBeNull();
	expect(validateSsoClientSecret("secret-456")).toBeNull();
});

test("reports one error per field, keyed to that field", () => {
	const result = createSsoFormSchema().safeParse({
		...valid,
		domain: "",
		issuer: "login.acme.com",
	});
	expect(result.success).toBe(false);
	const issues = result.error?.issues ?? [];
	expect(issues).toHaveLength(2);
	expect(issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
		["domain", "Enter your company domain."],
		["issuer", "Enter a valid issuer URL, like https://login.acme.com."],
	]);
});

test("trims the request payload and strips issuer trailing slash", () => {
	expect(
		buildSsoConnectionPayload({
			domain: "  HTTPS://Acme.com/ ",
			issuer: " https://login.acme.com/ ",
			clientId: " client-123 ",
			clientSecret: " secret-456 ",
		}),
	).toEqual({
		domain: "acme.com",
		issuer: "https://login.acme.com",
		clientId: "client-123",
		clientSecret: "secret-456",
	});
});

test("masks the client id and never exposes more than the last four", () => {
	expect(maskClientId("7f2a")).toBe("••••••••7f2a");
	expect(maskClientId("")).toBe("•".repeat(12));
});
