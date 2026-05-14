const API_KEY = "am_sk_live_Z2syCRIHHqSI1yz5hiTPj0PjUBDxCQ0KKICgNi20Mb";
const BASE_URL = "https://api.useautumn.com";

const PAGE_SIZE = 1000;

const formatMs = (ms: number) => `${ms.toFixed(0)}ms`;

const fetchPageInstrumented = async ({ offset }: { offset: number }) => {
  const t0 = performance.now();

  const res = await fetch(`${BASE_URL}/v1/customers.list`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${API_KEY}`,
      "x-api-version": "2.2.0",
    },
    body: JSON.stringify({ limit: PAGE_SIZE, offset }),
  });
  const t_headers = performance.now();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const buf = await res.arrayBuffer();
  const t_body = performance.now();

  const text = new TextDecoder().decode(buf);
  const t_decode = performance.now();

  const parsed = JSON.parse(text) as { list: unknown[] };
  const t_parse = performance.now();

  return {
    rows: parsed.list?.length ?? 0,
    bytes: buf.byteLength,
    headersMs: t_headers - t0,
    bodyMs: t_body - t_headers,
    decodeMs: t_decode - t_body,
    parseMs: t_parse - t_decode,
    totalMs: t_parse - t0,
    serverTime: res.headers.get("server-timing"),
    xResponseTime: res.headers.get("x-response-time"),
  };
};

console.log("Diagnostic: 5 sequential page requests to break down where time goes\n");
console.log(
  "Each request: headers (TLS + send + server + first byte) | body (response transfer) | decode (utf8) | parse (JSON)\n",
);

for (let i = 0; i < 5; i++) {
  const offset = i * PAGE_SIZE;
  try {
    const r = await fetchPageInstrumented({ offset });
    console.log(
      `[req ${i + 1}] offset=${offset.toString().padStart(5)} rows=${r.rows} bytes=${(r.bytes / 1024 / 1024).toFixed(2)}MB | headers=${formatMs(r.headersMs).padStart(7)} body=${formatMs(r.bodyMs).padStart(7)} decode=${formatMs(r.decodeMs).padStart(7)} parse=${formatMs(r.parseMs).padStart(7)} | total=${formatMs(r.totalMs)}`,
    );
    if (r.serverTime) console.log(`           server-timing: ${r.serverTime}`);
    if (r.xResponseTime) console.log(`           x-response-time: ${r.xResponseTime}`);
  } catch (e) {
    console.error(`[req ${i + 1}] failed:`, e);
  }
}
