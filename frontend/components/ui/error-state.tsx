"use client";

import { Button } from "./button";

export function ErrorState({
  title = "We couldn’t load this right now",
  description = "Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ui-state ui-state--error" role="alert">
      <h3 className="ui-state__title">{title}</h3>
      <p className="ui-state__description">{description}</p>
      {onRetry ? (
        <Button type="button" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
