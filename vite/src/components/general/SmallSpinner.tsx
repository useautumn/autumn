import { LucideLoaderCircle } from "lucide-react";

function SmallSpinner() {
  return (
    <LucideLoaderCircle
      className="animate-spin text-t3"
      size={18}
      color="#c4c4c4"
    />
  );
}

export default SmallSpinner;
