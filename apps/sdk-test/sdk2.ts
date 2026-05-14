const API_KEY = process.env.UNIT_TEST_AUTUMN_SECRET_KEY;
const BASE_URL = "http://localhost:8080";

const ESTIMATED_TOTAL = 1_000_000;
const PAGE_SIZE = 1000;
const EXPECTED_PAGES = Math.ceil(ESTIMATED_TOTAL / PAGE_SIZE);

const formatMs = (ms: number) => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
};

const pad = (n: number | string, width: number) =>
  String(n).padStart(width, " ");

const fetchPage = async ({ offset }: { offset: number }) => {
  const res = await fetch(`${BASE_URL}/v1/customers.list`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${API_KEY}`,
      "x-api-version": "2.2.0",
    },
    body: JSON.stringify({ limit: PAGE_SIZE, offset }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as { list: unknown[]; has_more?: boolean };
};

console.log(
  `Starting benchmark (V2.2 limit+offset, local) — estimated ${ESTIMATED_TOTAL.toLocaleString()} customers across ~${EXPECTED_PAGES.toLocaleString()} pages (limit=${PAGE_SIZE})`,
);
console.log();

const startedAt = performance.now();
let pageNum = 0;
let customersSeen = 0;
const requestSamples: number[] = [];
let offset = 0;

while (true) {
  const reqStart = performance.now();
  const page = await fetchPage({ offset });
  const reqEnd = performance.now();

  const rows = page.list ?? [];
  if (rows.length === 0) break;

  const requestMs = reqEnd - reqStart;
  requestSamples.push(requestMs);
  pageNum++;
  customersSeen += rows.length;

  const elapsedMs = reqEnd - startedAt;
  const totalReqMs = requestSamples.reduce((s, v) => s + v, 0);
  const avgReqMs = totalReqMs / pageNum;
  const recent = requestSamples.slice(-10);
  const rollingAvgMs = recent.reduce((s, v) => s + v, 0) / recent.length;
  const remainingPages = Math.max(0, EXPECTED_PAGES - pageNum);
  const etaMs = rollingAvgMs * remainingPages;
  const customerPct = ((customersSeen / ESTIMATED_TOTAL) * 100).toFixed(2);

  console.log(
    `page ${pad(pageNum, 5)}/${EXPECTED_PAGES} | ${pad(rows.length, 4)} rows | ${pad(customersSeen, 9)} (${pad(customerPct, 6)}%) | req ${formatMs(requestMs).padStart(7)} | avg ${formatMs(avgReqMs).padStart(7)} | last10 ${formatMs(rollingAvgMs).padStart(7)} | elapsed ${formatMs(elapsedMs).padStart(8)} | ETA ${formatMs(etaMs)}`,
  );

  if (page.has_more === false) break;
  if (rows.length < PAGE_SIZE) break;
  offset += rows.length;
}

const totalMs = performance.now() - startedAt;
const totalReqMs = requestSamples.reduce((s, v) => s + v, 0);
console.log();
console.log(
  `Done — ${customersSeen.toLocaleString()} customers across ${pageNum} pages in ${formatMs(totalMs)}`,
);
console.log(
  `Mean request ${formatMs(totalReqMs / pageNum)} · wall ${formatMs(totalMs / pageNum)}/page · loop overhead ${formatMs((totalMs - totalReqMs) / pageNum)}/page`,
);
