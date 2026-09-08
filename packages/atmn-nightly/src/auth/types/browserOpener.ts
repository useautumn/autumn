/**
 * Resolves once a browser was actually launched, and rejects otherwise — the
 * rejection is the only honest headless signal, since a TTY proves nothing.
 */
export type BrowserOpener = ({ url }: { url: string }) => Promise<void>;
