import { createFileRoute, redirect } from "@tanstack/react-router";
import { authStore } from "@/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      throw redirect({ to: authStore.get().token ? "/dashboard" : "/login" });
    }
    throw redirect({ to: "/login" });
  },
});