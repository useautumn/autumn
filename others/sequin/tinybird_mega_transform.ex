def transform(action, record, changes, metadata) do
  ts = metadata.commit_timestamp
  lsn = metadata.commit_lsn
  ikey = metadata.idempotency_key
  cdc = %{__action: action, __commit_timestamp: ts, __commit_lsn: lsn, __idempotency_key: ikey}

  di = fn v -> if v == nil, do: nil, else: Decimal.to_integer(v) end
  df = fn v -> if v == nil, do: nil, else: Decimal.to_float(v) end
  bi = fn v -> if v, do: 1, else: 0 end
  r = record

  Map.merge(
    cdc,
    case metadata.table_name do
      "customers" ->
        %{
          internal_id: r["internal_id"],
          org_id: r["org_id"],
          created_at: di.(r["created_at"]),
          name: r["name"],
          id: r["id"],
          email: r["email"],
          fingerprint: r["fingerprint"],
          metadata: r["metadata"] |> JSON.encode!(),
          env: r["env"],
          processor: r["processor"] |> JSON.encode!(),
          processors: (r["processors"] || %{}) |> JSON.encode!(),
          send_email_receipts: bi.(r["send_email_receipts"])
        }

      "invoices" ->
        %{
          id: r["id"],
          created_at: di.(r["created_at"]),
          product_ids: r["product_ids"] || [],
          internal_product_ids: r["internal_product_ids"] || [],
          internal_customer_id: r["internal_customer_id"],
          internal_entity_id: r["internal_entity_id"],
          stripe_id: r["stripe_id"],
          status: r["status"],
          hosted_invoice_url: r["hosted_invoice_url"],
          total: df.(r["total"]),
          currency: r["currency"],
          discounts: r["discounts"] |> JSON.encode!(),
          items: r["items"] |> JSON.encode!()
        }

      "organizations" ->
        %{
          id: r["id"],
          slug: r["slug"],
          name: r["name"],
          logo: r["logo"],
          created_at_ts: if(r["createdAt"] == nil, do: nil, else: to_string(r["createdAt"])),
          metadata: r["metadata"],
          default_currency: r["default_currency"] || "usd",
          stripe_connected: bi.(r["stripe_connected"]),
          created_at: di.(r["created_at"]),
          onboarded: bi.(r["onboarded"]),
          deployed: bi.(r["deployed"])
        }

      "customer_products" ->
        %{
          id: r["id"],
          internal_customer_id: r["internal_customer_id"],
          internal_product_id: r["internal_product_id"],
          internal_entity_id: r["internal_entity_id"],
          created_at: di.(r["created_at"]),
          status: r["status"],
          processor: r["processor"] |> JSON.encode!(),
          canceled: bi.(r["canceled"]),
          canceled_at: di.(r["canceled_at"]),
          ended_at: di.(r["ended_at"]),
          starts_at: di.(r["starts_at"]),
          options: (r["options"] || []) |> JSON.encode!(),
          product_id: r["product_id"],
          free_trial_id: r["free_trial_id"],
          trial_ends_at: di.(r["trial_ends_at"]),
          collection_method: r["collection_method"] || "charge_automatically",
          subscription_ids: r["subscription_ids"] || [],
          scheduled_ids: r["scheduled_ids"] || [],
          quantity: if(r["quantity"] == nil, do: 1.0, else: Decimal.to_float(r["quantity"])),
          is_custom: bi.(r["is_custom"]),
          customer_id: r["customer_id"],
          entity_id: r["entity_id"],
          billing_version: r["billing_version"],
          api_version: df.(r["api_version"]),
          api_semver: r["api_semver"]
        }

      "customer_entitlements" ->
        %{
          id: r["id"],
          customer_product_id: r["customer_product_id"],
          entitlement_id: r["entitlement_id"],
          internal_customer_id: r["internal_customer_id"],
          internal_entity_id: r["internal_entity_id"],
          internal_feature_id: r["internal_feature_id"],
          unlimited: bi.(r["unlimited"]),
          balance: if(r["balance"] == nil, do: 0.0, else: Decimal.to_float(r["balance"])),
          created_at: di.(r["created_at"]),
          next_reset_at: di.(r["next_reset_at"]),
          usage_allowed: bi.(r["usage_allowed"]),
          adjustment: df.(r["adjustment"]),
          additional_balance:
            if(r["additional_balance"] == nil,
              do: 0.0,
              else: Decimal.to_float(r["additional_balance"])
            ),
          entities: (r["entities"] || %{}) |> JSON.encode!(),
          expires_at: di.(r["expires_at"]),
          cache_version: r["cache_version"] || 0,
          customer_id: r["customer_id"],
          feature_id: r["feature_id"]
        }

      "customer_prices" ->
        %{
          id: r["id"],
          created_at: di.(r["created_at"]),
          price_id: r["price_id"],
          options: r["options"] |> JSON.encode!(),
          internal_customer_id: r["internal_customer_id"],
          customer_product_id: r["customer_product_id"]
        }

      "replaceables" ->
        %{
          id: r["id"],
          cus_ent_id: r["cus_ent_id"],
          created_at: r["created_at"],
          from_entity_id: r["from_entity_id"],
          delete_next_cycle: bi.(r["delete_next_cycle"])
        }

      "rollovers" ->
        %{
          id: r["id"],
          cus_ent_id: r["cus_ent_id"],
          balance: if(r["balance"] == nil, do: 0.0, else: Decimal.to_float(r["balance"])),
          expires_at: di.(r["expires_at"]),
          usage: if(r["usage"] == nil, do: 0.0, else: Decimal.to_float(r["usage"])),
          entities: (r["entities"] || %{}) |> JSON.encode!()
        }

      "entitlements" ->
        %{
          id: r["id"],
          created_at: di.(r["created_at"]),
          internal_feature_id: r["internal_feature_id"],
          internal_product_id: r["internal_product_id"],
          is_custom: bi.(r["is_custom"]),
          allowance_type: r["allowance_type"],
          allowance: df.(r["allowance"]),
          interval: r["interval"],
          interval_count:
            if(r["interval_count"] == nil, do: 1.0, else: Decimal.to_float(r["interval_count"])),
          carry_from_previous: bi.(r["carry_from_previous"]),
          entity_feature_id: r["entity_feature_id"],
          org_id: r["org_id"],
          feature_id: r["feature_id"],
          usage_limit: df.(r["usage_limit"]),
          rollover: r["rollover"] |> JSON.encode!()
        }

      "free_trials" ->
        %{
          id: r["id"],
          created_at: di.(r["created_at"]),
          internal_product_id: r["internal_product_id"],
          duration: r["duration"] || "day",
          length: df.(r["length"]),
          unique_fingerprint: bi.(r["unique_fingerprint"]),
          is_custom: bi.(r["is_custom"]),
          card_required: bi.(r["card_required"])
        }

      "entities" ->
        %{
          id: r["id"],
          org_id: r["org_id"],
          created_at: di.(r["created_at"]),
          internal_id: r["internal_id"],
          internal_customer_id: r["internal_customer_id"],
          env: r["env"],
          name: r["name"],
          deleted: bi.(r["deleted"]),
          internal_feature_id: r["internal_feature_id"],
          feature_id: r["feature_id"]
        }

      "features" ->
        %{
          internal_id: r["internal_id"],
          org_id: r["org_id"],
          created_at: di.(r["created_at"]),
          env: r["env"],
          id: r["id"],
          name: r["name"],
          type: r["type"],
          config: r["config"] |> JSON.encode!(),
          display: r["display"] |> JSON.encode!(),
          archived: bi.(r["archived"]),
          event_names: r["event_names"] || []
        }

      "prices" ->
        %{
          id: r["id"],
          org_id: r["org_id"],
          internal_product_id: r["internal_product_id"],
          config: r["config"] |> JSON.encode!(),
          created_at: di.(r["created_at"]),
          billing_type: r["billing_type"],
          tier_behavior: r["tier_behavior"],
          is_custom: bi.(r["is_custom"]),
          entitlement_id: r["entitlement_id"],
          proration_config: r["proration_config"] |> JSON.encode!()
        }

      "products" ->
        %{
          internal_id: r["internal_id"],
          id: r["id"],
          name: r["name"],
          description: r["description"],
          org_id: r["org_id"],
          created_at: di.(r["created_at"]),
          env: r["env"],
          is_add_on: bi.(r["is_add_on"]),
          is_default: bi.(r["is_default"]),
          group: r["group"],
          version: if(r["version"] == nil, do: 1.0, else: Decimal.to_float(r["version"])),
          processor: r["processor"] |> JSON.encode!(),
          base_variant_id: r["base_variant_id"],
          archived: bi.(r["archived"])
        }

      "subscriptions" ->
        %{
          id: r["id"],
          org_id: r["org_id"],
          stripe_id: r["stripe_id"],
          stripe_schedule_id: r["stripe_schedule_id"],
          created_at: di.(r["created_at"]),
          metadata: (r["metadata"] || %{}) |> JSON.encode!(),
          usage_features: r["usage_features"] || [],
          env: r["env"],
          current_period_start: di.(r["current_period_start"]),
          current_period_end: di.(r["current_period_end"])
        }
    end
  )
end
