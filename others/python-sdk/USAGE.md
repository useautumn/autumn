<!-- Start SDK Example Usage [usage] -->
```python
# Synchronous Example
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.check(customer_id="cus_123", feature_id="messages")

    # Handle response
    print(res)
```

</br>

The same SDK client can also be used to make asynchronous requests by importing asyncio.

```python
# Asynchronous Example
import asyncio
from autumn_sdk import Autumn

async def main():

    async with Autumn(
        x_api_version="2.1",
        secret_key="<YOUR_BEARER_TOKEN_HERE>",
    ) as autumn:

        res = await autumn.check_async(customer_id="cus_123", feature_id="messages")

        # Handle response
        print(res)

asyncio.run(main())
```
<!-- End SDK Example Usage [usage] -->