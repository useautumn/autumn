import json
import unittest

import httpx
from autumn_sdk import Autumn, models


class BillingCustomLineItemsTests(unittest.IsolatedAsyncioTestCase):
    """Public update and preview methods must send custom lines over HTTP."""

    async def asyncSetUp(self):
        self.requests = []
        transport = httpx.MockTransport(self.handle_request)
        self.client = httpx.Client(transport=transport)
        self.async_client = httpx.AsyncClient(transport=transport)
        self.autumn = Autumn(
            secret_key="test-key",
            server_url="https://autumn.test",
            client=self.client,
            async_client=self.async_client,
        )

    async def asyncTearDown(self):
        self.client.close()
        await self.async_client.aclose()

    def handle_request(self, request):
        self.requests.append(request)
        if request.url.path == "/v1/billing.preview_update":
            body = {
                "customer_id": "test-customer",
                "line_items": [],
                "subtotal": 17,
                "total": 17,
                "currency": "usd",
                "incoming": [],
                "outgoing": [],
                "intent": "none",
            }
        else:
            body = {"customer_id": "test-customer", "payment_url": None}
        return httpx.Response(200, json=body)

    async def assert_custom_lines_sent(self, method_name, path, line_model):
        lines = [
            {"amount": 20, "description": "Charge"},
            {"amount": -3, "description": "Credit"},
        ]
        for use_models in [False, True]:
            with self.subTest(use_models=use_models):
                self.requests.clear()
                params = {
                    "customer_id": "test-customer",
                    "plan_id": "pro",
                    "custom_line_items": (
                        [line_model(**line) for line in lines] if use_models else lines
                    ),
                }
                method = getattr(self.autumn.billing, method_name)
                result = method(**params)
                if method_name.endswith("_async"):
                    result = await result
                self.assertEqual(result.customer_id, "test-customer")
                self.assertEqual(len(self.requests), 1)
                request = self.requests[0]
                self.assertEqual(request.method, "POST")
                self.assertEqual(request.url.path, path)
                self.assertEqual(json.loads(request.content)["custom_line_items"], lines)

    async def test_update(self):
        await self.assert_custom_lines_sent(
            "update", "/v1/billing.update", models.BillingUpdateCustomLineItem
        )

    async def test_update_async(self):
        await self.assert_custom_lines_sent(
            "update_async", "/v1/billing.update", models.BillingUpdateCustomLineItem
        )

    async def test_preview_update(self):
        await self.assert_custom_lines_sent(
            "preview_update",
            "/v1/billing.preview_update",
            models.PreviewUpdateCustomLineItem,
        )

    async def test_preview_update_async(self):
        await self.assert_custom_lines_sent(
            "preview_update_async",
            "/v1/billing.preview_update",
            models.PreviewUpdateCustomLineItem,
        )
