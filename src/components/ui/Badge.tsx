import React from 'react';
import { Roles, Role } from '@/core/domain/roles';

export interface BadgeProps {
  role?: Role | string;
  variant?: 'admin' | 'planner' | 'reviewer' | 'neutral' | 'success' | 'warning' | 'error' | 'danger' | 'primary';
  children?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ role, variant, children, className = '' }) => {
  let badgeClass = 'badge-neutral';

  const roleValue = (role || '').toUpperCase();
  if (variant === 'admin' || roleValue === Roles.ADMIN) {
    badgeClass = 'badge-admin';
  } else if (variant === 'planner' || variant === 'primary' || roleValue === Roles.PLANNER) {
    badgeClass = 'badge-planner';
  } else if (variant === 'reviewer' || roleValue === Roles.REVIEWER) {
    badgeClass = 'badge-reviewer';
  } else if (variant === 'success' || roleValue === 'APPROVED' || roleValue === 'LOCKED' || roleValue === 'ACTIVE') {
    badgeClass = 'badge-success';
  } else if (variant === 'warning' || roleValue === 'UNDER_REVIEW' || roleValue === 'PENDING') {
    badgeClass = 'badge-warning';
  } else if (variant === 'error' || variant === 'danger' || roleValue === 'FAILED' || roleValue === 'REJECTED') {
    badgeClass = 'badge-error';
  } else if (variant) {
    badgeClass = `badge-${variant}`;
  }

  // Format display text nicely (e.g. "UNDER_REVIEW" -> "Under Review")
  let displayText = children || role;
  if (typeof displayText === 'string' && displayText.includes('_')) {
    displayText = displayText.replace(/_/g, ' ');
  }

  return <span className={`badge ${badgeClass} ${className}`}>{displayText}</span>;
};
