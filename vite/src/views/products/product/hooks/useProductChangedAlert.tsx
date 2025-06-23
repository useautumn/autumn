import { useEffect } from "react";

export const useProductChangedAlert = ({
  hasChanges,
}: {
  hasChanges: boolean;
}) => {
  useEffect(() => {
    if (!hasChanges) return;

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    let currentUrl = window.location.href;
    let isRestoring = false; // Flag to prevent recursive popstate events

    const handleNavigation = () => {
      const confirmed = window.confirm(
        "Are you sure you want to leave without updating the product? Click cancel to stay and save your changes, or click OK to leave without saving.",
      );
      return confirmed;
    };

    // Handle programmatic navigation (pushState/replaceState)
    window.history.pushState = function (...args) {
      if (handleNavigation()) {
        currentUrl = window.location.href;
        return originalPushState.apply(this, args);
      }
    };

    window.history.replaceState = function (...args) {
      if (handleNavigation()) {
        currentUrl = window.location.href;
        return originalReplaceState.apply(this, args);
      }
    };

    // Handle back/forward button navigation
    const handlePopState = (event: PopStateEvent) => {
      if (isRestoring) return; // Prevent handling our own restore operation

      const confirmed = window.confirm(
        "Are you sure you want to leave without updating the product? Click cancel to stay and save your changes, or click OK to leave without saving.",
      );

      if (!confirmed) {
        // User clicked Cancel (wants to stay) - go forward to undo the back navigation
        isRestoring = true;
        window.history.go(1); // Go forward to undo the back navigation
        setTimeout(() => {
          isRestoring = false;
        }, 100); // Reset flag after navigation
      } else {
        currentUrl = window.location.href;
      }
    };

    window.addEventListener("popstate", handlePopState);

    // Optional: Handle page unload/refresh as well
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ""; // Required for some browsers
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasChanges]);
};
