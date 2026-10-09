"use client";

import { ErrorCard } from "@/components/ErrorCard";

/** A page that failed to load, shown inside the menu. */
export default function PageError({ retry }: { retry: () => void }) {
  return <ErrorCard retry={retry} />;
}
