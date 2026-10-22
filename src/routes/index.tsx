import { createFileRoute } from "@tanstack/react-router";
import { ChartDesk } from "@/components/chart-desk";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <ChartDesk />;
}
