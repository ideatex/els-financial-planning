import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, id, required, className = '', ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/[^a-z0-9]+/g, '-') : undefined);

    return (
      <div className="form-group">
        {label && (
          <label
            htmlFor={inputId}
            className={`form-label ${required ? 'form-label-required' : ''}`}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          className={`form-input ${className}`}
          style={error ? { borderColor: 'var(--error-text)' } : undefined}
          {...props}
        />
        {error && <p className="form-error">{error}</p>}
        {!error && helperText && <p className="form-helper">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
