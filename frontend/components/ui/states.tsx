import type { ReactNode } from "react";

export function LoadingState({
  label = "Loading",
}: {
  label?: string;
}) {
  return (
    <div className="ui-state" role="status" aria-live="polite">
      <span className="ui-state__spinner" aria-hidden="true" />
      <p className="ui-state__description">{label}</p>
    </div>
  );
}

export function EventGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="event-grid-skeleton" role="status" aria-label="Loading events">
      {Array.from({ length: count }, (_, index) => <div className="event-skeleton" key={index} aria-hidden="true"><span /><div><i /><i /><i /></div></div>)}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-state" role="status">
      <h3 className="ui-state__title">{title}</h3>
      <p className="ui-state__description">{description}</p>
      {action}
    </div>
  );
}
