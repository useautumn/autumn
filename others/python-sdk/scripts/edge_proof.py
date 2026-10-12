"""Proves `edge_url`, `client.edge.check` and `use_edge` on an installed autumn-sdk, against local stand-ins and a real edge.

Run: packages/sdk/scripts/edge-proof/README.md (the Python twin of edgeProof.ts, with the same environment variables)."""

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable, List, Optional, Tuple

import httpx
from autumn_sdk import Autumn, errors

STAGING_API_URL = "https://api-staging.useautumn.com"
CHECK = {"customer_id": "cus_proof", "feature_id": "messages"}

results: List[Tuple[str, bool, str]] = []


class Stand:
    """A local server answering every request with `body`, after `delay_s`, counting what it was sent."""

    def __init__(self, status: int, body: dict, delay_s: float = 0.0):
        self.hits = 0
        stand = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # pylint: disable=invalid-name
                stand.hits += 1
                self.rfile.read(int(self.headers.get("content-length") or 0))
                time.sleep(delay_s)
                payload = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(payload)))
                self.end_headers()
                try:
                    self.wfile.write(payload)
                except (BrokenPipeError, ConnectionResetError):
                    pass

            def log_message(self, *args):
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._server.daemon_threads = True
        self.url = f"http://127.0.0.1:{self._server.server_address[1]}"
        threading.Thread(target=self._server.serve_forever, daemon=True).start()

    def close(self):
        self._server.shutdown()
        self._server.server_close()


def check_body(customer_id: str) -> dict:
    return {"allowed": True, "customer_id": customer_id, "balance": None, "flag": None}


def dead_url() -> str:
    stand = Stand(200, {})
    stand.close()
    return stand.url


def record(name: str, run: Callable[[], str]) -> None:
    try:
        results.append((name, True, run()))
    except Exception as error:  # pylint: disable=broad-exception-caught
        results.append((name, False, repr(error)))


def traced_client() -> Tuple[httpx.Client, List[str]]:
    """Every reply's host and status, in order. Needs `fail_open=False`: fail-open wraps the HTTP client."""
    replies: List[str] = []

    def on_response(response: httpx.Response) -> None:
        forwarded = response.headers.get("x-atom-forwarded")
        replies.append(
            f"{response.request.url.netloc.decode()} {response.status_code}"
            + (f" forwarded={forwarded}" if forwarded else "")
        )

    return httpx.Client(follow_redirects=True, event_hooks={"response": [on_response]}), replies


def run_local() -> None:
    autumn = Stand(200, check_body("from_autumn"))
    base = {"secret_key": "am_sk_test_proof", "server_url": autumn.url}

    def answered_by_edge() -> str:
        edge = Stand(200, check_body("from_edge"))
        before = autumn.hits
        response = Autumn(**base, edge_url=edge.url).edge.check(**CHECK)
        edge.close()
        assert response.customer_id == "from_edge" and autumn.hits == before
        return f"customer_id={response.customer_id}, Autumn hits +0"

    def dead_edge_falls_back() -> str:
        response = Autumn(**base, edge_url=dead_url()).edge.check(**CHECK)
        assert response.customer_id == "from_autumn"
        return f"customer_id={response.customer_id}"

    def edge_4xx_does_not_fall_back() -> str:
        edge = Stand(400, {"code": "invalid_request"})
        before = autumn.hits
        try:
            Autumn(**base, edge_url=edge.url, fail_open=False).edge.check(**CHECK)
            raise AssertionError("no error")
        except errors.AutumnError as error:
            assert error.status_code == 400 and autumn.hits == before
        finally:
            edge.close()
        return "raised 400, Autumn hits +0"

    def slow_edge_falls_back() -> str:
        edge = Stand(200, check_body("from_edge"), delay_s=3.0)
        started_at = time.monotonic()
        response = Autumn(**base, edge_url=edge.url).edge.check(**CHECK)
        took_s = time.monotonic() - started_at
        edge.close()
        assert response.customer_id == "from_autumn" and took_s < 2.0
        return f"fell back after {took_s * 1000:.0f}ms (the edge would take 3000ms)"

    def no_edge_url() -> str:
        before = autumn.hits
        response = Autumn(**base).edge.check(**CHECK)
        assert response.customer_id == "from_autumn" and autumn.hits == before + 1
        return "Autumn hits +1"

    def use_edge_on_and_off() -> str:
        edge = Stand(200, check_body("from_edge"))
        on = Autumn(**base, edge_url=edge.url, use_edge=True).check(**CHECK)
        off = Autumn(**base, edge_url=edge.url).check(**CHECK)
        edge.close()
        assert on.customer_id == "from_edge" and off.customer_id == "from_autumn"
        return f"use_edge on: {on.customer_id}; off: {off.customer_id}"

    record("(a) local: client.edge.check answered by the edge", answered_by_edge)
    record("(b) local: dead edge_url falls back", dead_edge_falls_back)
    record("(c) local: edge 4xx does not fall back", edge_4xx_does_not_fall_back)
    record("(d) local: a slow edge falls back within the call", slow_edge_falls_back)
    record("(e) local: no edge_url goes straight to Autumn", no_edge_url)
    record("(g) local: use_edge routes client.check, off it doesn't", use_edge_on_and_off)
    autumn.close()


def run_staging(edge_url: str, secret_key: Optional[str], customer_id: Optional[str], feature_id: Optional[str]) -> None:
    edge_host = httpx.URL(edge_url).netloc.decode()
    if not secret_key or not customer_id or not feature_id:
        return
    check = {"customer_id": customer_id, "feature_id": feature_id}
    options = {"secret_key": secret_key, "server_url": STAGING_API_URL, "fail_open": False}

    def answered_by_edge() -> str:
        client, replies = traced_client()
        response = Autumn(**options, edge_url=edge_url, client=client).edge.check(**check)
        assert replies == [f"{edge_host} 200"], replies
        return f"replies: {' | '.join(replies)}; allowed={response.allowed}"

    def use_edge_routes_check() -> str:
        client, replies = traced_client()
        response = Autumn(**options, edge_url=edge_url, use_edge=True, client=client).check(**check)
        assert replies == [f"{edge_host} 200"], replies
        return f"replies: {' | '.join(replies)}; allowed={response.allowed}"

    def dead_edge_same_shape() -> str:
        via_edge = Autumn(**options, edge_url=edge_url).edge.check(**check)
        client, replies = traced_client()
        via_fallback = Autumn(**options, edge_url=dead_url(), client=client).edge.check(**check)
        assert set(via_fallback.model_dump()) == set(via_edge.model_dump())
        assert via_fallback.customer_id == customer_id
        assert [reply.split(" ")[0] for reply in replies] == ["api-staging.useautumn.com"], replies
        return f"replies: {' | '.join(replies)}; fields match, customer_id={via_fallback.customer_id}"

    def no_edge_url() -> str:
        client, replies = traced_client()
        Autumn(**options, client=client).edge.check(**check)
        assert [reply.split(" ")[0] for reply in replies] == ["api-staging.useautumn.com"], replies
        return f"replies: {' | '.join(replies)}"

    record("(a) staging: client.edge.check answered by the edge", answered_by_edge)
    record("(g) staging: use_edge routes client.check to the edge", use_edge_routes_check)
    record("(b) staging: dead edge_url, same shape from Autumn", dead_edge_same_shape)
    record("(e) staging: no edge_url goes straight to api-staging", no_edge_url)


def main() -> int:
    run_local()
    if os.environ.get("EDGE_URL"):
        run_staging(
            os.environ["EDGE_URL"],
            os.environ.get("STAGING_SECRET_KEY"),
            os.environ.get("CUSTOMER_ID"),
            os.environ.get("FEATURE_ID"),
        )
    else:
        print("EDGE_URL unset: skipped the staging checks")
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'} {name}: {detail}")
    return 0 if all(ok for _, ok, _ in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
