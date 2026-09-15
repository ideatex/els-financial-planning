'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Roles, Role } from '@/core/domain/roles';

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

interface CurrentUserContext {
  user: { id: string; email: string; name: string };
  organization: { id: string; name: string; slug: string } | null;
  membership: { id: string; role: Role } | null;
}

export default function MembersPage() {
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invite Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>(Roles.PLANNER);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchSessionAndMembers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) throw new Error('Failed to load session');
      const meData = await meRes.json();
      setContext(meData);

      if (meData.organization?.id) {
        const membersRes = await fetch(`/api/organizations/${meData.organization.id}/members`);
        if (!membersRes.ok) throw new Error('Failed to load organization members');
        const membersData = await membersRes.json();
        setMembers(membersData.members);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching members';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionAndMembers();
  }, []);

  const isAdmin = context?.membership?.role === Roles.ADMIN;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!context?.organization?.id) return;
    setIsSubmitting(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/organizations/${context.organization.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName || undefined,
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to add member');
      }

      setIsModalOpen(false);
      setInviteEmail('');
      setInviteName('');
      setInviteRole(Roles.PLANNER);
      setSuccessMsg(`Successfully added ${inviteEmail} as ${inviteRole}`);
      fetchSessionAndMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add member';
      setModalError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (memberUserId: string, newRole: Role) => {
    if (!context?.organization?.id) return;
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/organizations/${context.organization.id}/members/${memberUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to update role');
      }

      setSuccessMsg('Member role updated successfully');
      fetchSessionAndMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update member role';
      setError(msg);
    }
  };

  const handleRemoveMember = async (memberUserId: string, memberEmail: string) => {
    if (!context?.organization?.id) return;
    if (!confirm(`Are you sure you want to remove ${memberEmail} from this organization?`)) {
      return;
    }

    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/organizations/${context.organization.id}/members/${memberUserId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to remove member');
      }

      setSuccessMsg(`Member ${memberEmail} removed`);
      fetchSessionAndMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove member';
      setError(msg);
    }
  };

  return (
    <div>
      <PageHeader
        title="Team Members"
        description={`Manage user access and role assignments for ${context?.organization?.name || 'Organization'}.`}
        breadcrumbs={[
          { label: 'Overview', href: '/' },
          { label: 'Administration' },
          { label: 'Team Members' },
        ]}
        actions={
          isAdmin ? (
            <Button
              variant="primary"
              id="btn-open-invite"
              onClick={() => {
                setModalError(null);
                setIsModalOpen(true);
              }}
            >
              + Add Member
            </Button>
          ) : undefined
        }
      />

      {error && <Alert type="error">{error}</Alert>}
      {successMsg && <Alert type="success">{successMsg}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Members ({members.length})</CardTitle>
            <CardDescription>
              {isAdmin
                ? 'Administrators can assign roles (Admin, Planner, Reviewer) and revoke access'
                : 'Current organization roster and permission roles'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading member records...
            </div>
          ) : members.length === 0 ? (
            <EmptyState
              title="No members registered"
              description="Invite team members to collaborate on manufacturing planning scenarios."
            />
          ) : (
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table" id="table-members">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Email Address</th>
                    <th>Role Assignment</th>
                    <th>Date Joined</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const isSelf = member.userId === context?.user?.id;
                    return (
                      <tr key={member.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>
                            {member.name} {isSelf && <span style={{ color: 'var(--primary)', fontWeight: 500, fontSize: 12 }}>(You)</span>}
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{member.email}</td>
                        <td>
                          {isAdmin ? (
                            <select
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.userId, e.target.value as Role)}
                              className="form-select"
                              style={{ width: 130, height: 30, fontSize: 12, padding: '0 8px', borderColor: 'var(--border-strong)' }}
                            >
                              <option value={Roles.ADMIN}>Admin</option>
                              <option value={Roles.PLANNER}>Planner</option>
                              <option value={Roles.REVIEWER}>Reviewer</option>
                            </select>
                          ) : (
                            <Badge role={member.role} />
                          )}
                        </td>
                        <td className="tabular-nums" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                          {new Date(member.joinedAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        {isAdmin && (
                          <td style={{ textAlign: 'right' }}>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={isSelf && member.role === Roles.ADMIN}
                              onClick={() => handleRemoveMember(member.userId, member.email)}
                              title={
                                isSelf && member.role === Roles.ADMIN
                                  ? 'Cannot delete your own admin account'
                                  : 'Remove member from organization'
                              }
                            >
                              Remove
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Member Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Team Member">
        {modalError && <Alert type="error">{modalError}</Alert>}

        <form onSubmit={handleInvite}>
          <Input
            label="Corporate Email Address"
            id="input-invite-email"
            type="email"
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />

          <Input
            label="Full Name (Optional)"
            id="input-invite-name"
            placeholder="Jane Doe"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
          />

          <Select
            label="System Role Authority"
            id="select-invite-role"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            options={[
              { value: Roles.PLANNER, label: 'Planner — Creates & edits scenarios, runs calculations' },
              { value: Roles.REVIEWER, label: 'Reviewer — Approves & locks plan versions, views statements' },
              { value: Roles.ADMIN, label: 'Admin — Full organization and member administration' },
            ]}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-divider)' }}>
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" id="btn-submit-invite" isLoading={isSubmitting}>
              Add Member
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
