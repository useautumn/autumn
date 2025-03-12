// import { LucideLoader2 } from "lucide-react";

import { LoaderCircle } from "lucide-react";

function SmallSpinner() {
  // return <Spinner color="default" size="sm" className="scale-80" />;
  return (
    // <div className="w-4 h-4 animate-spin rounded-full border-b-2 border-t-2 border-gray-900 dark:border-white" />
    <LoaderCircle className="animate-spin text-zinc-300" size={20} />
  );
}

export default SmallSpinner;
