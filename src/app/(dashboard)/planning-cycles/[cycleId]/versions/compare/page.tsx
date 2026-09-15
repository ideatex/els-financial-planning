'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { SummaryMetric } from '@/components/ui/SummaryMetric';

export default function VersionComparisonPage() {
  const params = useParams();
  const cycleId = params.cycleId as string;

  const [versions, setVersions] = useState<any[]>([]);
  const [sourceVersionId, setSourceVersionId] = useState<string>('');
  const [targetVersionId, setTargetVersionId] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const [diffData, setDiffData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVersions() {
      try {
        const res = await fetch(`/api/planning/cycles/${cycleId}/versions`);
        const data = await res.json();
        const vList = data.versions || [];
        setVersions(vList);

        if (vList.length >= 2) {
          setSourceVersionId(vList[0].id);
          setTargetVersionId(vList[1].id);
        } else if (vList.length === 1) {
          setSourceVersionId(vList[0].id);
        }
      } catch (err: any) {
        setError(err.message);
      }
    }
    if (cycleId) loadVersions();
  }, [cycleId]);

  const runComparison = useCallback(async () => {
    if (!sourceVersionId || !targetVersionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/planning/versions/compare?sourceVersionId=${sourceVersionId}&targetVersionId=${targetVersionId}&category=${categoryFilter}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Comparison failed');
      setDiffData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sourceVersionId, targetVersionId, categoryFilter]);

  useEffect(() => {
    if (sourceVersionId && targetVersionId && sourceVersionId !== targetVersionId) {
      runComparison();
    } else {
      setDiffData(null);
    }
  }, [sourceVersionId, targetVersionId, categoryFilter, runComparison]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan Version Comparison"
        description="Side-by-side dimensional delta analysis between baseline, forecast, and scenario planning versions"
        breadcrumbs={[
          { label: 'Planning Cycles', href: '/planning-cycles' },
          { label: 'Version Manager', href: `/planning-cycles/${cycleId}/versions` },
          { label: 'Version Comparison' },
        ]}
      />

      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* Version Selectors */}
      <Card>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Source Version (Baseline)</label>
            <Select
              value={sourceVersionId}
              onChange={(e) => setSourceVersionId(e.target.value)}
              options={versions.map((v) => ({
                value: v.id,
                label: `${v.versionCode} • ${v.versionName} (${v.status})`,
              }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Target Version (Scenario / Comparison)</label>
            <Select
              value={targetVersionId}
              onChange={(e) => setTargetVersionId(e.target.value)}
              options={versions.map((v) => ({
                value: v.id,
                label: `${v.versionCode} • ${v.versionName} (${v.status})`,
              }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Category Filter</label>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Categories' },
                { value: 'TARGETS', label: 'Management Targets' },
                { value: 'ASSUMPTIONS', label: 'Assumptions' },
                { value: 'INPUTS', label: 'Plan Inputs (All)' },
                { value: 'DEMAND', label: 'Demand Inputs' },
                { value: 'PRODUCTION', label: 'Production Inputs' },
                { value: 'OPEX', label: 'Opex Inputs' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Comparison Metrics */}
      {diffData && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <SummaryMetric
            label="Changed Values"
            value={diffData.summary.totalChanged}
            subtext="Values with numeric / textual delta"
          />
          <SummaryMetric
            label="Added Records"
            value={diffData.summary.totalAdded}
            subtext="Present in target, absent in baseline"
          />
          <SummaryMetric
            label="Removed Records"
            value={diffData.summary.totalRemoved}
            subtext="Present in baseline, omitted in target"
          />
          <SummaryMetric
            label="Unchanged"
            value={diffData.summary.totalUnchanged}
            subtext="Identical parameters across versions"
          />
        </div>
      )}

      {/* Comparison Grid */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Dimension / Scope</th>
                <th className="px-4 py-3">Metric / Code</th>
                <th className="px-4 py-3 text-right">Source Value</th>
                <th className="px-4 py-3 text-right">Target Value</th>
                <th className="px-4 py-3 text-right">Delta</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {!diffData || diffData.diffs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8">
                    <EmptyState
                      title={loading ? 'Comparing Versions...' : 'No Comparison Data Available'}
                      description="Select two different plan versions to inspect parameter differences."
                    />
                  </td>
                </tr>
              ) : (
                diffData.diffs.map((diff: any) => (
                  <tr key={diff.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">
                      {diff.category}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{diff.dimension}</td>
                    <td className="px-4 py-3 font-mono font-medium text-gray-900">{diff.metricOrCode}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600 tabular-nums">
                      {diff.sourceValue !== null && diff.sourceValue !== undefined
                        ? String(diff.sourceValue)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900 tabular-nums">
                      {diff.targetValue !== null && diff.targetValue !== undefined
                        ? String(diff.targetValue)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {diff.delta !== null && diff.delta !== undefined ? (
                        <span className={diff.delta > 0 ? 'text-green-600 font-semibold' : diff.delta < 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                          {diff.delta > 0 ? `+${diff.delta}` : diff.delta}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          diff.changeType === 'ADDED'
                            ? 'success'
                            : diff.changeType === 'REMOVED'
                            ? 'danger'
                            : diff.changeType === 'CHANGED'
                            ? 'primary'
                            : 'neutral'
                        }
                      >
                        {diff.changeType}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
