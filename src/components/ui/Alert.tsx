import React from 'react';

export interface AlertProps {
  type?: 'error' | 'success' | 'warning' | 'info';
  variant?: 'error' | 'danger' | 'success' | 'warning' | 'info';
  children?: React.ReactNode;
  message?: string;
  title?: string;
  className?: string;
  onClose?: () => void;
  style?: React.CSSProperties;
}

export const Alert: React.FC<AlertProps> = ({
  type,
  variant,
  children,
  message,
  title,
  className = '',
  onClose,
  style,
}) => {
  const resolvedType = (variant === 'danger' ? 'error' : variant) || type || 'info';

  return (
    <div className={`alert alert-${resolvedType} ${className}`} role="alert" style={style}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        {resolvedType === 'error' && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM7.25 4.5h1.5v4.5h-1.5V4.5zm0 6h1.5v1.5h-1.5v-1.5z" />
          </svg>
        )}
        {resolvedType === 'success' && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zm3.354-8.646l-4.5 4.5a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L6.5 8.793l4.146-4.147a.5.5 0 0 1 .708.708z" />
          </svg>
        )}
        {resolvedType === 'warning' && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
          </svg>
        )}
        {resolvedType === 'info' && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM7.25 7h1.5v4.5h-1.5V7zm0-2.5h1.5v1.5h-1.5V4.5z" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>}
        <div>{children || message}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss alert"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            color: 'currentColor',
            opacity: 0.7,
            marginLeft: 8,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
};
