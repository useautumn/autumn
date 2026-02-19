import { Autumn as autumn } from "autumn-js";

const { data, error } = await autumn.check({
  customer_id: "cus_123",
  feature_id: "chat_messages",
  with_preview: true,
});
