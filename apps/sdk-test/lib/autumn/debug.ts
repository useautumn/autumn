const PREFIX = "[sdk-test][autumn]";

export const logServerDebug = ({
  label,
  payload,
}: {
  label: string;
  payload: unknown;
}) => {
  console.log(`${PREFIX} ${label}`, payload);
};

export const summarizeBody = ({ body }: { body: unknown }) => {
  if (!body || typeof body !== "object") {
    return { kind: typeof body, keys: [] as Array<string> };
  }

  return {
    kind: Array.isArray(body) ? "array" : "object",
    keys: Object.keys(body as Record<string, unknown>),
  };
};
