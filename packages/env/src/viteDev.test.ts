import { describe, expect, test } from "bun:test";
import { viteHmrClient } from "./viteDev.js";

describe("viteHmrClient", () => {
	test("uses 443 on https so portless and the public host share one Vite process", () => {
		expect(
			viteHmrClient({
				frontendUrl: "https://wt45.localhost",
				vitePort: 7400,
			}),
		).toEqual({ clientPort: 443 });
		expect(
			viteHmrClient({
				frontendUrl: "https://autumn-wt45.autumnworktree.com",
				vitePort: 7400,
			}),
		).toEqual({ clientPort: 443 });
	});

	test("uses the portless listen port when it is not 443", () => {
		expect(
			viteHmrClient({
				frontendUrl: "https://wt45.localhost:1355",
				vitePort: 7400,
			}),
		).toEqual({ clientPort: 1355 });
	});

	test("falls back to the listen port when the frontend URL is unusable", () => {
		expect(viteHmrClient({ frontendUrl: "", vitePort: 7400 })).toEqual({
			port: 7400,
		});
		expect(viteHmrClient({ frontendUrl: "not-a-url", vitePort: 3000 })).toEqual({
			port: 3000,
		});
	});
});
