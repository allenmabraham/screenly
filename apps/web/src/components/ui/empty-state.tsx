import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ""}`}>
      {icon ? <span className="empty-state__icon">{icon}</span> : null}
      <h2 className="empty-state__title">{title}</h2>
      {description ? <p className="empty-state__body">{description}</p> : null}
      {actions ? <div className="empty-state__actions">{actions}</div> : null}
    </div>
  );
}
