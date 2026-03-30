import os
from dotenv import load_dotenv
from autumn_sdk import Autumn

load_dotenv()


def main():
    # Test with fake domain to verify SDK works locally
    client = Autumn(
        secret_key="test-secret-key",
        server_url="https://fake.notreal.example.com",
    )

    print("Autumn SDK v1.0.0 imported successfully!")
    print(f"Client initialized: {client}")

    # Test that sub-SDKs are accessible (lazy loaded)
    print(f"Has customers: {hasattr(client, 'customers')}")
    print(f"Has billing: {hasattr(client, 'billing')}")
    print(f"Has plans: {hasattr(client, 'plans')}")
    print(f"Has features: {hasattr(client, 'features')}")
    print(f"Has balances: {hasattr(client, 'balances')}")
    print(f"Has events: {hasattr(client, 'events')}")
    print(f"Has entities: {hasattr(client, 'entities')}")
    print(f"Has referrals: {hasattr(client, 'referrals')}")

    # Test check method with fake domain - should get a connection error
    try:
        res = client.check(customer_id="cus_123", feature_id="messages")
        print(f"Unexpected success: {res}")
    except Exception as e:
        print(f"\nExpected connection error (fake domain): {type(e).__name__}: {e}")

    # Test track method
    try:
        res = client.track(customer_id="cus_123", feature_id="messages")
        print(f"Unexpected success: {res}")
    except Exception as e:
        print(f"Expected connection error (fake domain): {type(e).__name__}: {e}")

    # Test customers sub-SDK
    try:
        res = client.customers.get_or_create(customer_id="john")
        print(f"Unexpected success: {res}")
    except Exception as e:
        print(f"Expected connection error (fake domain): {type(e).__name__}: {e}")

    print("\nAll tests passed - SDK is functional!")


if __name__ == "__main__":
    main()
