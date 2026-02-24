export const cn = (...inputs: Array<string | false | null | undefined>) => {
  return inputs.filter(Boolean).join(" ");
};

export const toPrettyJson = ({ value }: { value: unknown }) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
