export const createSandboxJsDoc = `Creates a sandbox: an isolated copy of your organization with its own catalog, customers and secret key. Returns the sandbox's secret key once, in this response — store it, it cannot be read back. Authenticated with your organization's secret key (a sandbox's own key cannot create sandboxes).`;

export const listSandboxesJsDoc = `Lists every sandbox belonging to your organization, newest first. Secret keys are never returned here — only \`sandboxes.create\` shows one.`;

export const deleteSandboxJsDoc = `Permanently deletes a sandbox and everything inside it: its catalog, customers and secret key. Cannot be undone.`;
