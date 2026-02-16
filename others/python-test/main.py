import os
from dotenv import load_dotenv
from autumn_sdk import Autumn

load_dotenv()


def main():
    # Initialize the Autumn SDK
    client = Autumn(secret_key=os.getenv("AUTUMN_SECRET_KEY"))

    # Example: Get or create a customer
    customer = client.customers.get_or_create(customer_id="john")
    print(customer)

    print("Autumn SDK imported successfully!")
    print(f"Client initialized: {client}")


if __name__ == "__main__":
    main()
