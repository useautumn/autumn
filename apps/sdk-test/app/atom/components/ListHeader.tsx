export const ListHeader = ({
  title,
  clearLabel = "Clear",
  onClear,
}: {
  title: string;
  clearLabel?: string;
  onClear: () => void;
}) => (
  <div className="flex items-center justify-between px-4 py-2.5">
    <p className="text-sm font-semibold text-foreground">{title}</p>
    <button
      type="button"
      className="text-xs text-tertiary-foreground hover:text-foreground"
      onClick={onClear}
    >
      {clearLabel}
    </button>
  </div>
);
