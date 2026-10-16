import { describe, expect, test } from "bun:test";
import type { AxiosInstance } from "axios";
import { emptyAccess } from "@/views/settings/sections/roles/roleAccess";
import { rolesApi } from "@/views/settings/sections/roles/rolesApi";

const recordingAxios = () => {
	const calls: { url: string; body: unknown }[] = [];
	const axios = {
		post: async (url: string, body: unknown) => {
			calls.push({ url, body });
			return { data: url === "/roles.list" ? { list: [] } : { id: "x" } };
		},
	} as unknown as AxiosInstance;
	return { axios, calls };
};

describe("roles.* RPC", () => {
	const access = emptyAccess();

	test.each([
		{
			verb: "list",
			run: (api: ReturnType<typeof rolesApi>) => api.list(),
			call: { url: "/roles.list", body: {} },
		},
		{
			verb: "create",
			run: (api: ReturnType<typeof rolesApi>) =>
				api.create({ body: { id: "support", name: "Support", access } }),
			call: {
				url: "/roles.create",
				body: { id: "support", name: "Support", access },
			},
		},
		{
			verb: "update",
			run: (api: ReturnType<typeof rolesApi>) =>
				api.update({ body: { id: "support", name: "Customer support" } }),
			call: {
				url: "/roles.update",
				body: { id: "support", name: "Customer support" },
			},
		},
		{
			verb: "delete",
			run: (api: ReturnType<typeof rolesApi>) => api.delete({ id: "support" }),
			call: { url: "/roles.delete", body: { id: "support" } },
		},
	])("$verb posts to $call.url", async ({ run, call }) => {
		const { axios, calls } = recordingAxios();
		await run(rolesApi({ axios }));
		expect(calls).toEqual([call]);
	});
});
