import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { randomString } from "https://jslib.k6.io/k6-utils/1.2.0/index.js";

// ─── Config ──────────────────────────────────────────────────────────
const BASE_URL = __ENV.K6_BASE_URL || "http://localhost:8080";
const API_KEY = __ENV.K6_BOMBER;
const FEATURE_ID = __ENV.K6_FEATURE_ID || "messages";

if (!API_KEY) {
  throw new Error("K6_BOMBER env var required (Autumn secret key)");
}

const HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${API_KEY}`,
};

// ─── Custom Metrics ──────────────────────────────────────────────────
const createCustomerDuration = new Trend("create_customer_duration", true);
const trackDuration = new Trend("track_duration", true);
const flowDuration = new Trend("full_flow_duration", true);

const createCustomerErrors = new Rate("create_customer_errors");
const trackErrors = new Rate("track_errors");

const totalRequests = new Counter("total_requests");

// ─── Scenarios ───────────────────────────────────────────────────────
//
// Scenario 1: "isolated" — blast create-customer and track independently
// Scenario 2: "flow"     — sequential create-customer → track (real flow)
//
// Run all:    k6 run load-test.js
// Run one:    k6 run --env SCENARIO=isolated load-test.js
//             k6 run --env SCENARIO=flow load-test.js

const SCENARIO = __ENV.SCENARIO || "all";

const scenarios = {};

if (SCENARIO === "all" || SCENARIO === "isolated") {
  scenarios.isolated_create_customer = {
    executor: "ramping-vus",
    exec: "isolatedCreateCustomer",
    startVUs: 0,
    stages: [
      { duration: "10s", target: 50 },
      { duration: "20s", target: 200 },
      { duration: "30s", target: 500 },
      { duration: "20s", target: 200 },
      { duration: "10s", target: 0 },
    ],
    tags: { scenario: "isolated_create_customer" },
  };

  scenarios.isolated_track = {
    executor: "ramping-vus",
    exec: "isolatedTrack",
    startVUs: 0,
    startTime: "5s", // slight offset so customers exist
    stages: [
      { duration: "10s", target: 50 },
      { duration: "20s", target: 200 },
      { duration: "30s", target: 500 },
      { duration: "20s", target: 200 },
      { duration: "10s", target: 0 },
    ],
    tags: { scenario: "isolated_track" },
  };
}

if (SCENARIO === "all" || SCENARIO === "flow") {
  scenarios.sequential_flow = {
    executor: "ramping-vus",
    exec: "sequentialFlow",
    startVUs: 0,
    stages: [
      { duration: "10s", target: 30 },
      { duration: "20s", target: 100 },
      { duration: "30s", target: 300 },
      { duration: "20s", target: 100 },
      { duration: "10s", target: 0 },
    ],
    tags: { scenario: "sequential_flow" },
  };
}

export const options = {
  scenarios,
  thresholds: {
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
    create_customer_errors: ["rate<0.1"],
    track_errors: ["rate<0.1"],
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────

function makeCustomerId() {
  return `k6_${__VU}_${__ITER}_${randomString(6)}`;
}

function createCustomer(customerId) {
  const payload = JSON.stringify({
    id: customerId,
    name: `K6 Load Test ${customerId}`,
    email: `${customerId}@k6-loadtest.dev`,
  });

  const start = Date.now();
  const res = http.post(`${BASE_URL}/v1/customers`, payload, {
    headers: HEADERS,
  });
  const duration = Date.now() - start;

  createCustomerDuration.add(duration);
  totalRequests.add(1);

  const ok = check(res, {
    "create-customer status 2xx": (r) => r.status >= 200 && r.status < 300,
  });
  createCustomerErrors.add(!ok);

  return { res, ok, customerId };
}

function trackUsage(customerId, value) {
  const payload = JSON.stringify({
    customer_id: customerId,
    feature_id: FEATURE_ID,
    value: value || 1,
  });

  const start = Date.now();
  const res = http.post(`${BASE_URL}/v1/track`, payload, {
    headers: HEADERS,
  });
  const duration = Date.now() - start;

  trackDuration.add(duration);
  totalRequests.add(1);

  const ok = check(res, {
    "track status 2xx": (r) => r.status >= 200 && r.status < 300,
  });
  trackErrors.add(!ok);

  return { res, ok };
}

// ─── Scenario Executors ──────────────────────────────────────────────

// Type 1a: Blast create-customer
export function isolatedCreateCustomer() {
  const custId = makeCustomerId();
  createCustomer(custId);
  sleep(0.1);
}

// Type 1b: Blast track (uses VU-scoped customer so we don't 404)
export function isolatedTrack() {
  // Each VU gets a stable customer — created once, tracked many times
  const custId = `k6_track_vu${__VU}`;

  if (__ITER === 0) {
    createCustomer(custId);
  }

  trackUsage(custId, 1);
  sleep(0.1);
}

// Type 2: Sequential flow — create → track N times
export function sequentialFlow() {
  const custId = makeCustomerId();

  group("full_flow", () => {
    const flowStart = Date.now();

    // Step 1: Create customer
    const { ok: cusOk } = createCustomer(custId);
    if (!cusOk) return; // bail if customer creation failed

    // Step 2: Track usage 3 times (simulates real usage burst)
    for (let i = 0; i < 3; i++) {
      trackUsage(custId, 1);
    }

    flowDuration.add(Date.now() - flowStart);
  });

  sleep(0.2);
}
