export default function DashboardLoading() {
  return (
    <div className="animate-fade-in space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="skeleton h-72" />
    </div>
  );
}
