export const createWebhookJsDoc = `Creates a webhook: a URL Autumn sends the listed events to, in the environment of the calling key. You choose the \`id\`, and it can't be changed later. Returns the signing secret once, in this response — store it, it cannot be read back.`;

export const getWebhookJsDoc = `Gets one webhook by ID. The signing secret is never returned here — only \`webhooks.create\` and \`webhooks.sync\` show one, when they create the webhook.`;

export const listWebhooksJsDoc = `Lists every webhook in the environment of the calling key, including ones made in the dashboard (these show their \`ep_…\` ID).`;

export const updateWebhookJsDoc = `Updates a webhook's URL, events, description or disabled state. Only the fields you pass change. The ID can't be changed — to rename, create a new webhook.`;

export const deleteWebhookJsDoc = `Permanently deletes a webhook. Autumn stops sending it events immediately. Cannot be undone.`;

export const previewSyncWebhooksJsDoc = `Shows what \`webhooks.sync\` would do with the same body, without changing anything: which webhooks it would create or update, and which existing ones it would leave alone because the body doesn't list them.`;

export const syncWebhooksJsDoc = `Makes the listed webhooks exist as described: creates missing ones and updates ones that differ. Webhooks not listed are left alone — sync never deletes. Returns the signing secret of each webhook it created, once. Each webhook is applied on its own: failures are listed in \`errors\` while the rest still apply, and the request fails only when none could be applied.`;
