import { LoaderCircle } from "lucide-react";
import React from "react";

function LoadingScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <LoaderCircle className="animate-spin" size={30} />
    </div>
  );
}

export default LoadingScreen;
