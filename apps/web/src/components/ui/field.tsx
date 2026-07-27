"use client";

import { useState, type InputHTMLAttributes } from "react";

import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";

type FieldProps = {
  label: string;
  id: string;
  hint?: string;
  className?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function Field({ label, id, hint, className, ...props }: FieldProps) {
  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input className="input" id={id} {...props} />
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}

/** Password field with a reveal toggle, so typos are recoverable. */
export function PasswordField({
  label,
  id,
  hint,
  className,
  ...props
}: FieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="input-group">
        <input
          className="input"
          id={id}
          type={isVisible ? "text" : "password"}
          {...props}
        />
        <button
          aria-label={isVisible ? "Hide password" : "Show password"}
          aria-pressed={isVisible}
          className="input-group__action"
          onClick={() => setIsVisible((current) => !current)}
          type="button"
        >
          {isVisible ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
        </button>
      </div>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}
