import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const clientSource = (): string =>
	readFileSync(
		`${import.meta.dir}/../../atmn/src/generated/client.ts`,
		"utf8",
	);

test("every sandbox operation reaches the client as a method on its own path", () => {
	const source = clientSource();
	for (const [method, path] of [
		["createSandbox", "/v1/sandboxes.create"],
		["listSandboxes", "/v1/sandboxes.list"],
		["deleteSandbox", "/v1/sandboxes.delete"],
	]) {
		expect(source).toContain(`${method}: async (`);
		expect(source).toContain(`path: "${path}"`);
	}
});

test("a typed request body is recased on the way out, the catalog document is not", () => {
	const source = clientSource();
	expect(source).toContain("body: CreateSandboxParams");
	expect(source).toContain("hints: CREATESANDBOX_REQUEST_HINTS");
	expect(source).toContain("body: WireDocument");
	expect(source).toContain('path: "/v1/catalogV2.update", body: body }');
});

test("the sandbox response types carry the fields the CLI prints", () => {
	const source = clientSource();
	expect(source).toContain("export type CreateSandboxResponse = {");
	expect(source).toContain("export type ListSandboxesResponse = {");
	expect(source).toContain("export type DeleteSandboxResponse = {");
	expect(source).toContain("createdAt: number;");
	expect(source).toContain("secretKey: string;");
});
