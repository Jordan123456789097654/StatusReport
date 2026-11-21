import { Tabs } from "@/components/ui";

export function IncidentTabs({ active }: { active: "incidents" | "maintenance" | "reports" }) {
  return (
    <Tabs
      active={active}
      tabs={[
        { key: "incidents", label: "Incidents", href: "/dashboard/incidents" },
        { key: "maintenance", label: "Maintenance windows", href: "/dashboard/incidents/maintenance" },
        { key: "reports", label: "User reports", href: "/dashboard/incidents/reports" },
      ]}
    />
  );
}
