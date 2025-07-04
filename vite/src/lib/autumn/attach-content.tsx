import { type CheckProductPreview } from "autumn-js";

export const getAttachContent = (preview: CheckProductPreview) => {
  const {
    scenario,
    product_name,
    recurring,
    current_product_name,
    next_cycle_at,
  } = preview;

  const nextCycleAtStr = next_cycle_at
    ? new Date(next_cycle_at).toLocaleDateString()
    : undefined;

  switch (scenario) {
    case "scheduled":
      return {
        title: <p>{product_name} product already scheduled</p>,
        message: (
          <p>
            You are currently on product {current_product_name} and are
            scheduled to start {product_name} on {nextCycleAtStr}.
          </p>
        ),
      };

    case "active":
      return {
        title: <p>Product already active</p>,
        message: <p>You are already subscribed to this product.</p>,
      };

    case "new":
      if (recurring) {
        return {
          title: <p>Subscribe to {product_name}</p>,
          message: (
            <p>
              By clicking confirm, you will be subscribed to {product_name} and
              your card will be charged immediately.
            </p>
          ),
        };
      } else {
        return {
          title: <p>Purchase {product_name}</p>,
          message: (
            <p>
              By clicking confirm, you will purchase {product_name} and your
              card will be charged immediately.
            </p>
          ),
        };
      }

    case "renew":
      return {
        title: <p>Renew</p>,
        message: (
          <p>
            By clicking confirm, you will renew your subscription to{" "}
            {product_name}.
          </p>
        ),
      };

    case "upgrade":
      return {
        title: <p>Upgrade to {product_name}</p>,
        message: (
          <p>
            By clicking confirm, you will upgrade to {product_name} and your
            payment method will be charged immediately.
          </p>
        ),
      };

    case "downgrade":
      return {
        title: <p>Downgrade to {product_name}</p>,
        message: (
          <p>
            By clicking confirm, your current subscription to{" "}
            {current_product_name} will be cancelled and a new subscription to{" "}
            {product_name} will begin on {nextCycleAtStr}.
          </p>
        ),
      };

    case "cancel":
      return {
        title: <p>Cancel</p>,
        message: (
          <p>
            By clicking confirm, your subscription to {current_product_name}{" "}
            will end on {nextCycleAtStr}.
          </p>
        ),
      };

    default:
      return {
        title: <p>Change Subscription</p>,
        message: <p>You are about to change your subscription.</p>,
      };
  }
};
