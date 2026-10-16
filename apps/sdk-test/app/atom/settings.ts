import type { AtomConfig } from "@/lib/atom/types";

export type Scope = "customer" | "entity";

export type PlaygroundSettings = AtomConfig & {
  customerId: string;
  featureId: string;
  scope: Scope;
  entityId: string;
};

const STORAGE_KEY = "sdk-test:atom-playground:v2";

const DEFAULT_SETTINGS: PlaygroundSettings = {
  customerId: "",
  featureId: "",
  scope: "customer",
  entityId: "entity1",
  secretKey: "",
  edgeURL: process.env.NEXT_PUBLIC_ATOM_EDGE_URL ?? "",
  serverURL: "",
  useEdge: true,
};

export const loadSettings = (): PlaygroundSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = ({ settings }: { settings: PlaygroundSettings }) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

export const configOf = ({ settings }: { settings: PlaygroundSettings }): AtomConfig => ({
  secretKey: settings.secretKey,
  edgeURL: settings.edgeURL,
  serverURL: settings.serverURL,
  useEdge: settings.useEdge,
});

export const baseParamsOf = ({ settings }: { settings: PlaygroundSettings }) => ({
  customerId: settings.customerId,
  featureId: settings.featureId,
  entityId: settings.scope === "entity" ? settings.entityId || undefined : undefined,
});

export type BaseParams = ReturnType<typeof baseParamsOf>;
