import { expect, test } from "bun:test";
import { Autumn } from "../src/sdk/sdk.js";

const startDelayedServer = () =>
  Bun.serve({
    port: 0,
    async fetch() {
      await Bun.sleep(250);
      return Response.json({ list: [], total: {} });
    },
  });

test("a per-call timeout can extend the client timeout", async () => {
  const server = startDelayedServer();

  try {
    const autumn = new Autumn({
      secretKey: "test",
      serverURL: `http://127.0.0.1:${server.port}`,
      timeoutMs: 100,
    });
    const response = await autumn.events.aggregate(
      { featureId: "credits", range: "90d" },
      { timeoutMs: 1_000 },
    );

    expect(response).toEqual({ list: [], total: {} });
  } finally {
    await server.stop(true);
  }
});

test("the client timeout applies without a per-call override", async () => {
  const server = startDelayedServer();

  try {
    const autumn = new Autumn({
      failOpen: false,
      secretKey: "test",
      serverURL: `http://127.0.0.1:${server.port}`,
      timeoutMs: 100,
    });

    await expect(
      autumn.events.aggregate({ featureId: "credits", range: "90d" }),
    ).rejects.toMatchObject({ name: "RequestTimeoutError" });
  } finally {
    await server.stop(true);
  }
});
