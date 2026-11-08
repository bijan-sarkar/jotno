"use client";

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";

// Full-screen flows that should not show the tab bar
const NO_NAV_ROUTES = ["/onboarding", "/~offline", "/scanner", "/live"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // "/" is the simple Bangla voice home, which has its own large controls
  const showNav = pathname !== "/" && !NO_NAV_ROUTES.some((r) => pathname.startsWith(r));

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-canvas sm:my-6 sm:min-h-[calc(100dvh-3rem)] sm:rounded-[40px] sm:shadow-float sm:overflow-hidden relative">
      <div className={showNav ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))]" : ""}>{children}</div>
      {showNav && <BottomNav />}
    </div>
  );
}
