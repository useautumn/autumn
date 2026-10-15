import json
import re
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable, Dict, List, Optional

import httpx
from autumn_sdk import Autumn
from autumn_sdk.utils import BackoffStrategy, RetryConfig

EDGE = "https://edge.test"
AUTUMN = "https://autumn.test"
CHECK = {"customer_id": "customer_123", "feature_id": "messages"}
FINALIZE = {"lock_id": "lock_1", "action": "confirm"}
UUID = re.compile(r"^[0-9a-f-]{36}$")

Reply = Callable[[httpx.Request], httpx.Response]


def check_answer(customer_id: str) -> httpx.Response:
    return httpx.Response(
        200, json={"allowed": True, "customer_id": customer_id, "balance": None, "flag": None}
    )


def finalized() -> httpx.Response:
    return httpx.Response(200, json={"success": True})


def edge_down(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(503, json={"message": "Atom thread 1 is unavailable", "code": "atom_unavailable"})


EDGE_DOWN_REPLIES: Dict[str, Reply] = {
    "503 atom_unavailable": edge_down,
    "500 internal_error": lambda _: httpx.Response(500, json={"code": "internal_error"}),
    "502 from a proxy": lambda _: httpx.Response(502, text="Bad Gateway"),
    "504 from a proxy": lambda _: httpx.Response(504, text="Gateway Timeout"),
}


def raises(error: type) -> Reply:
    def reply(request: httpx.Request) -> httpx.Response:
        raise error("stand-in", request=request)

    return reply


class Hosts:
    """A transport answering the edge and Autumn with stand-ins, keeping what each was sent."""

    def __init__(self, edge: Reply, autumn: Reply, real_edge: bool = False):
        self.sent: Dict[str, List[httpx.Request]] = {"edge": [], "autumn": []}
        self._replies = {"edge": edge, "autumn": autumn}
        self._real = httpx.HTTPTransport() if real_edge else None

    def host_of(self, request: httpx.Request) -> str:
        return "autumn" if request.url.host == "autumn.test" else "edge"

    def handle(self, request: httpx.Request) -> httpx.Response:
        host = self.host_of(request)
        request.read()
        self.sent[host].append(request)
        if host == "edge" and self._real is not None:
            return self._real.handle_request(request)
        return self._replies[host](request)

    def keys(self, host: str) -> List[Optional[str]]:
        return [request.headers.get("idempotency-key") for request in self.sent[host]]


class SyncTransport(httpx.BaseTransport):
    def __init__(self, hosts: Hosts):
        self.hosts = hosts

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        return self.hosts.handle(request)


class AsyncTransport(httpx.AsyncBaseTransport):
    def __init__(self, hosts: Hosts):
        self.hosts = hosts

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        return self.hosts.handle(request)


def client_for(
    hosts: Hosts, edge_url: str = EDGE, use_edge: bool = True, **options
) -> Autumn:
    return Autumn(
        secret_key="am_sk_test",
        server_url=AUTUMN,
        edge_url=edge_url,
        use_edge=use_edge,
        client=httpx.Client(transport=SyncTransport(hosts)),
        async_client=httpx.AsyncClient(transport=AsyncTransport(hosts)),
        **options,
    )


class SlowEdge:
    """A real local edge that finalizes after `delay_s`."""

    def __init__(self, delay_s: float):
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # pylint: disable=invalid-name
                self.rfile.read(int(self.headers.get("content-length") or 0))
                time.sleep(delay_s)
                payload = json.dumps({"success": True}).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *args):
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._server.daemon_threads = True
        self.url = f"http://127.0.0.1:{self._server.server_address[1]}"
        threading.Thread(target=self._server.serve_forever, daemon=True).start()

    def close(self):
        self._server.shutdown()
        self._server.server_close()


def closed_url() -> str:
    edge = SlowEdge(0)
    edge.close()
    return edge.url


WRITES = {
    "send_event": {**CHECK, "send_event": True},
    "lock": {**CHECK, "lock": {"enabled": True, "lock_id": "lock_1"}},
}


class WriteCheckTests(unittest.TestCase):
    def test_goes_to_the_edge_with_a_generated_key(self):
        for name, write in WRITES.items():
            with self.subTest(name):
                hosts = Hosts(edge=lambda _: check_answer("from_edge"), autumn=lambda _: check_answer("from_autumn"))
                response = client_for(hosts).check(**write)
                self.assertEqual(response.customer_id, "from_edge")
                self.assertEqual(hosts.sent["autumn"], [])
                [key] = hosts.keys("edge")
                self.assertRegex(key or "", UUID)

    def test_each_call_gets_its_own_key(self):
        for name, write in WRITES.items():
            with self.subTest(name):
                hosts = Hosts(edge=lambda _: check_answer("from_edge"), autumn=lambda _: check_answer("from_autumn"))
                client = client_for(hosts)
                client.check(**write)
                client.check(**write)
                first, second = hosts.keys("edge")
                self.assertIsNotNone(first)
                self.assertNotEqual(first, second)

    def test_sends_the_callers_key_unchanged(self):
        for name, write in WRITES.items():
            with self.subTest(name):
                hosts = Hosts(edge=lambda _: check_answer("from_edge"), autumn=lambda _: check_answer("from_autumn"))
                client_for(hosts).check(**write, http_headers={"Idempotency-Key": "caller_key_1"})
                self.assertEqual(hosts.keys("edge"), ["caller_key_1"])

    def test_falls_back_on_edge_down_with_the_same_key(self):
        for fail_open in (True, False):
            for down_name, down in EDGE_DOWN_REPLIES.items():
                for name, write in WRITES.items():
                    with self.subTest(name, down=down_name, fail_open=fail_open):
                        hosts = Hosts(edge=down, autumn=lambda _: check_answer("from_autumn"))
                        response = client_for(hosts, fail_open=fail_open).check(**write)
                        self.assertEqual(response.customer_id, "from_autumn")
                        [key] = hosts.keys("edge")
                        self.assertIsNotNone(key)
                        self.assertEqual(hosts.keys("autumn"), [key])

    def test_falls_back_after_an_edge_timeout_with_the_same_key(self):
        for fail_open in (True, False):
            for name, write in WRITES.items():
                with self.subTest(name, fail_open=fail_open):
                    hosts = Hosts(edge=raises(httpx.ReadTimeout), autumn=lambda _: check_answer("from_autumn"))
                    response = client_for(hosts, fail_open=fail_open).check(**write)
                    self.assertEqual(response.customer_id, "from_autumn")
                    [key] = hosts.keys("edge")
                    self.assertIsNotNone(key)
                    self.assertEqual(hosts.keys("autumn"), [key])

    def test_keeps_one_key_across_every_retry_and_fallback(self):
        for name, write in WRITES.items():
            with self.subTest(name):
                hosts = Hosts(edge=edge_down, autumn=lambda _: httpx.Response(503, json={"message": "Down"}))
                retries = RetryConfig("backoff", BackoffStrategy(1, 5, 1, 50), False)
                with self.assertRaises(Exception):
                    client_for(hosts, fail_open=False).check(**write, retries=retries)
                keys = hosts.keys("edge") + hosts.keys("autumn")
                self.assertGreater(len(hosts.sent["edge"]), 1)
                self.assertEqual(len(set(keys)), 1)
                self.assertIsNotNone(keys[0])

    def test_without_use_edge_goes_to_autumn_with_no_key(self):
        for name, write in WRITES.items():
            with self.subTest(name):
                hosts = Hosts(edge=lambda _: check_answer("from_edge"), autumn=lambda _: check_answer("from_autumn"))
                client_for(hosts, use_edge=False).check(**write)
                self.assertEqual(hosts.sent["edge"], [])
                self.assertEqual(hosts.keys("autumn"), [None])

    def test_a_plain_check_carries_no_key(self):
        hosts = Hosts(edge=edge_down, autumn=lambda _: check_answer("from_autumn"))
        client_for(hosts).check(**CHECK)
        self.assertEqual(hosts.keys("edge"), [None])
        self.assertEqual(hosts.keys("autumn"), [None])


class WriteCheckAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_falls_back_with_the_same_key(self):
        hosts = Hosts(edge=edge_down, autumn=lambda _: check_answer("from_autumn"))
        response = await client_for(hosts).check_async(**WRITES["send_event"])
        self.assertEqual(response.customer_id, "from_autumn")
        [key] = hosts.keys("edge")
        self.assertRegex(key or "", UUID)
        self.assertEqual(hosts.keys("autumn"), [key])


class FinalizeTests(unittest.TestCase):
    def test_goes_to_the_edge_with_no_generated_key(self):
        hosts = Hosts(edge=lambda _: finalized(), autumn=lambda _: finalized())
        client_for(hosts).balances.finalize(**FINALIZE)
        self.assertEqual([r.url.path for r in hosts.sent["edge"]], ["/v1/balances.finalize"])
        self.assertEqual(hosts.keys("edge"), [None])
        self.assertEqual(hosts.sent["autumn"], [])

    def test_sends_the_callers_key_unchanged(self):
        hosts = Hosts(edge=lambda _: finalized(), autumn=lambda _: finalized())
        client_for(hosts).balances.finalize(**FINALIZE, http_headers={"Idempotency-Key": "caller_key_1"})
        self.assertEqual(hosts.keys("edge"), ["caller_key_1"])

    def test_without_use_edge_goes_to_autumn(self):
        hosts = Hosts(edge=lambda _: finalized(), autumn=lambda _: finalized())
        client_for(hosts, use_edge=False).balances.finalize(**FINALIZE)
        self.assertEqual(hosts.sent["edge"], [])
        self.assertEqual(len(hosts.sent["autumn"]), 1)

    def test_falls_back_when_the_edge_was_never_reached(self):
        for fail_open in (True, False):
            for edge_url in (closed_url(), "http://edge.invalid"):
                with self.subTest(edge_url, fail_open=fail_open):
                    hosts = Hosts(edge=lambda _: finalized(), autumn=lambda _: finalized(), real_edge=True)
                    client_for(hosts, edge_url=edge_url, fail_open=fail_open).balances.finalize(
                        **FINALIZE, http_headers={"Idempotency-Key": "caller_key_1"}
                    )
                    self.assertEqual(hosts.keys("autumn"), ["caller_key_1"])

    def test_falls_back_after_a_connect_timeout(self):
        for fail_open in (True, False):
            with self.subTest(fail_open=fail_open):
                hosts = Hosts(edge=raises(httpx.ConnectTimeout), autumn=lambda _: finalized())
                client_for(hosts, fail_open=fail_open).balances.finalize(
                    **FINALIZE, http_headers={"Idempotency-Key": "caller_key_1"}
                )
                self.assertEqual(hosts.keys("autumn"), ["caller_key_1"])

    def test_falls_back_on_the_edges_own_404(self):
        for fail_open in (True, False):
            with self.subTest(fail_open=fail_open):
                hosts = Hosts(edge=lambda _: httpx.Response(404, text="404 Not Found"), autumn=lambda _: finalized())
                client_for(hosts, fail_open=fail_open).balances.finalize(**FINALIZE)
                self.assertEqual(len(hosts.sent["edge"]), 1)
                self.assertEqual(len(hosts.sent["autumn"]), 1)

    def test_never_resends_after_an_ambiguous_failure(self):
        ambiguous = {**EDGE_DOWN_REPLIES, "read timeout": raises(httpx.ReadTimeout)}
        for fail_open in (True, False):
            for name, reply in ambiguous.items():
                with self.subTest(name, fail_open=fail_open):
                    hosts = Hosts(edge=reply, autumn=lambda _: finalized())
                    with self.assertRaises(Exception):
                        client_for(hosts, fail_open=fail_open).balances.finalize(**FINALIZE)
                    self.assertEqual(len(hosts.sent["edge"]), 1)
                    self.assertEqual(hosts.sent["autumn"], [])

    def test_waits_past_the_edges_1s_check_budget(self):
        edge = SlowEdge(1.3)
        try:
            hosts = Hosts(edge=lambda _: finalized(), autumn=lambda _: finalized(), real_edge=True)
            response = client_for(hosts, edge_url=edge.url).balances.finalize(**FINALIZE)
            self.assertTrue(response.success)
            self.assertEqual(hosts.sent["autumn"], [])
        finally:
            edge.close()

    def test_a_forwarded_404_is_autumns_answer(self):
        hosts = Hosts(
            edge=lambda _: httpx.Response(
                404, json={"message": "Lock not found"}, headers={"x-atom-forwarded": "lock_not_held"}
            ),
            autumn=lambda _: finalized(),
        )
        with self.assertRaises(Exception):
            client_for(hosts, fail_open=False).balances.finalize(**FINALIZE)
        self.assertEqual(hosts.sent["autumn"], [])


class FinalizeAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_never_resends_after_an_ambiguous_failure(self):
        hosts = Hosts(edge=edge_down, autumn=lambda _: finalized())
        with self.assertRaises(Exception):
            await client_for(hosts).balances.finalize_async(**FINALIZE)
        self.assertEqual(hosts.sent["autumn"], [])

    async def test_falls_back_on_the_edges_own_404(self):
        hosts = Hosts(edge=lambda _: httpx.Response(404, text="404 Not Found"), autumn=lambda _: finalized())
        await client_for(hosts).balances.finalize_async(**FINALIZE)
        self.assertEqual(len(hosts.sent["autumn"]), 1)


if __name__ == "__main__":
    unittest.main()
