/**
 * @param webhook the webhook object
 * @param webhook.method destination method. Allowed values: "POST", "PUT"
 * @param webhook.url current destination address
 * @param webhook.eventType current webhook Event Type
 * @param webhook.payload JSON payload
 * @param webhook.cancel whether to cancel dispatch of the given webhook
 */
function handler(webhook) {
  var AUTUMN_BASE = "https://app.useautumn.com/customers/";
  var AUTUMN_USERNAME = "Autumn";
  var AUTUMN_AVATAR_URL = "https://i.ibb.co/BHCF1ZqL/autumnicon.png";

  // Discord embed colors (decimal RGB).
  var COLOR_SUCCESS = 0x22c55e;
  var COLOR_INFO    = 0x3b82f6;
  var COLOR_WARNING = 0xf59e0b;
  var COLOR_DANGER  = 0xef4444;
  var COLOR_NEUTRAL = 0x6b7280;

  var payload = webhook.payload || {};
  var data = payload.data || payload;

  // ============ customer.products.updated ============
  if (webhook.eventType === "customer.products.updated") {
    var scenario = data.scenario || "updated";
    var customer = data.customer || {};
    var entity = data.entity || null;
    var product = data.updated_product || {};

    var customerName = customer.name || customer.email || customer.id || "Customer";
    var customerEmail = customer.email || null;
    var customerId = customer.id || "";

    var productName = product.name || "their plan";
    if (product.version && product.version !== 1) {
      productName = productName + " V" + product.version;
    }

    var entityLabel = null;
    if (entity) {
      entityLabel = entity.name || entity.id || null;
    }

    var emoji = "🔔";
    var header = "Subscription Updated";
    var verb = "updated";
    var color = COLOR_NEUTRAL;

    if (scenario === "new") {
      emoji = "🎉"; header = "New Subscription"; verb = "subscribed to"; color = COLOR_SUCCESS;
    } else if (scenario === "upgrade") {
      emoji = "🚀"; header = "Customer Upgraded"; verb = "upgraded to"; color = COLOR_SUCCESS;
    } else if (scenario === "downgrade") {
      emoji = "📉"; header = "Customer Downgraded"; verb = "downgraded to"; color = COLOR_WARNING;
    } else if (scenario === "cancel") {
      emoji = "⚠️"; header = "Subscription Cancelled"; verb = "cancelled"; color = COLOR_WARNING;
    } else if (scenario === "renew") {
      emoji = "🔄"; header = "Subscription Uncancelled"; verb = "uncancelled"; color = COLOR_SUCCESS;
    } else if (scenario === "expired") {
      emoji = "💀"; header = "Subscription Expired"; verb = "expired on"; color = COLOR_DANGER;
    } else if (scenario === "scheduled") {
      emoji = "📅"; header = "Change Scheduled"; verb = "scheduled a change to"; color = COLOR_INFO;
    }

    var sentence;
    if (scenario === "expired") {
      sentence = "**" + customerName + "**'s **" + productName + "** expired";
    } else {
      sentence = "**" + customerName + "** " + verb + " **" + productName + "**";
    }

    var description = sentence;
    if (customerId) {
      description += "\n\n[View in Autumn](" + AUTUMN_BASE + customerId + ")";
    }

    var fields = [
      { name: "Customer", value: customerName, inline: true }
    ];
    if (customerEmail) {
      fields.push({ name: "Email", value: customerEmail, inline: true });
    }
    fields.push({ name: "Product", value: productName, inline: true });
    fields.push({ name: "Scenario", value: "`" + scenario + "`", inline: true });
    if (entityLabel) {
      fields.push({ name: "Entity", value: entityLabel, inline: true });
    }

    var embed = {
      title: emoji + " " + header,
      description: description,
      color: color,
      fields: fields
    };
    if (customerId) {
      embed.url = AUTUMN_BASE + customerId;
    }
    var footerParts = [];
    if (customerId) footerParts.push("Customer ID: " + customerId);
    if (entity && entity.id) footerParts.push("Entity: " + entity.id);
    if (footerParts.length > 0) {
      embed.footer = { text: footerParts.join(" | ") };
    }

    webhook.payload = {
      username: AUTUMN_USERNAME,
      avatar_url: AUTUMN_AVATAR_URL,
      embeds: [embed]
    };
    return webhook;
  }

  // ============ balances.limit_reached ============
  if (webhook.eventType === "balances.limit_reached") {
    var lrCustomerId = data.customer_id || "";
    var lrFeatureId = data.feature_id || "feature";
    var lrLimitType = data.limit_type || "included";
    var lrEntityId = data.entity_id || null;

    var lrCustomerDisplay = lrCustomerId
      ? "[`" + lrCustomerId + "`](" + AUTUMN_BASE + lrCustomerId + ")"
      : "`unknown`";

    var lrDescription =
      lrCustomerDisplay + " hit their **" + lrFeatureId + "** `" + lrLimitType + "` limit";
    if (lrCustomerId) {
      lrDescription += "\n\n[View in Autumn](" + AUTUMN_BASE + lrCustomerId + ")";
    }

    var lrFields = [
      {
        name: "Customer",
        value: lrCustomerId ? "`" + lrCustomerId + "`" : "—",
        inline: true
      },
      { name: "Feature", value: "`" + lrFeatureId + "`", inline: true },
      { name: "Limit Type", value: "`" + lrLimitType + "`", inline: true }
    ];
    if (lrEntityId) {
      lrFields.push({ name: "Entity", value: "`" + lrEntityId + "`", inline: true });
    }

    var lrEmbed = {
      title: "🚫 Limit Reached",
      description: lrDescription,
      color: COLOR_DANGER,
      fields: lrFields
    };
    if (lrCustomerId) {
      lrEmbed.url = AUTUMN_BASE + lrCustomerId;
    }
    var lrFooterParts = [];
    if (lrCustomerId) lrFooterParts.push("Customer ID: " + lrCustomerId);
    if (lrEntityId) lrFooterParts.push("Entity: " + lrEntityId);
    if (lrFooterParts.length > 0) {
      lrEmbed.footer = { text: lrFooterParts.join(" | ") };
    }

    webhook.payload = {
      username: AUTUMN_USERNAME,
      avatar_url: AUTUMN_AVATAR_URL,
      embeds: [lrEmbed]
    };
    return webhook;
  }

  // ============ balances.usage_alert_triggered ============
  if (webhook.eventType === "balances.usage_alert_triggered") {
    var uaCustomerId = data.customer_id || "";
    var uaFeatureId = data.feature_id || "feature";
    var uaEntityId = data.entity_id || null;
    var uaAlert = data.usage_alert || {};
    var uaAlertName = uaAlert.name || "Usage alert";
    var uaThreshold = uaAlert.threshold;
    var uaThresholdType = uaAlert.threshold_type || "usage";

    var uaThresholdLabel = "—";
    if (uaThreshold !== undefined && uaThreshold !== null) {
      if (uaThresholdType === "usage_percentage") {
        uaThresholdLabel = uaThreshold + "% used";
      } else if (uaThresholdType === "remaining_percentage") {
        uaThresholdLabel = uaThreshold + "% remaining";
      } else if (uaThresholdType === "remaining") {
        uaThresholdLabel = uaThreshold + " remaining";
      } else {
        uaThresholdLabel = uaThreshold + " used";
      }
    }

    var uaCustomerDisplay = uaCustomerId
      ? "[`" + uaCustomerId + "`](" + AUTUMN_BASE + uaCustomerId + ")"
      : "`unknown`";

    var uaDescription =
      uaCustomerDisplay + " crossed the **" + uaAlertName + "** threshold on **" + uaFeatureId + "**";
    if (uaCustomerId) {
      uaDescription += "\n\n[View in Autumn](" + AUTUMN_BASE + uaCustomerId + ")";
    }

    var uaFields = [
      {
        name: "Customer",
        value: uaCustomerId ? "`" + uaCustomerId + "`" : "—",
        inline: true
      },
      { name: "Feature", value: "`" + uaFeatureId + "`", inline: true },
      { name: "Alert", value: uaAlertName, inline: true },
      { name: "Threshold", value: uaThresholdLabel, inline: true }
    ];
    if (uaEntityId) {
      uaFields.push({ name: "Entity", value: "`" + uaEntityId + "`", inline: true });
    }

    var uaEmbed = {
      title: "📊 Usage Alert: " + uaAlertName,
      description: uaDescription,
      color: COLOR_WARNING,
      fields: uaFields
    };
    if (uaCustomerId) {
      uaEmbed.url = AUTUMN_BASE + uaCustomerId;
    }
    var uaFooterParts = [];
    if (uaCustomerId) uaFooterParts.push("Customer ID: " + uaCustomerId);
    if (uaEntityId) uaFooterParts.push("Entity: " + uaEntityId);
    if (uaFooterParts.length > 0) {
      uaEmbed.footer = { text: uaFooterParts.join(" | ") };
    }

    webhook.payload = {
      username: AUTUMN_USERNAME,
      avatar_url: AUTUMN_AVATAR_URL,
      embeds: [uaEmbed]
    };
    return webhook;
  }

  // Unmatched event type — cancel dispatch.
  webhook.cancel = true;
  return webhook;
}
