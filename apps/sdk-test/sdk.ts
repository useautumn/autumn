import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.UNIT_TEST_AUTUMN_SECRET_KEY,
  serverURL: "http://localhost:8080",
});

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

console.log(
  `Starting benchmark — estimated ${ESTIMATED_TOTAL.toLocaleString()} customers across ~${EXPECTED_PAGES.toLocaleString()} pages (limit=${PAGE_SIZE})`,
);
console.log();

const startedAt = performance.now();
let pageNum = 0;
let customersSeen = 0;
const requestSamples: number[] = [];

const iterator = (await autumn.customers.list({ limit: PAGE_SIZE }))[
  Symbol.asyncIterator
]();

while (true) {
  const reqStart = performance.now();
  const { value: page, done } = await iterator.next();
  const reqEnd = performance.now();
  if (done) break;

  const requestMs = reqEnd - reqStart;
  requestSamples.push(requestMs);
  pageNum++;

  const rows = page.result?.list ?? [];
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
