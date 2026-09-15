'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';

interface ForecastOption {
  id: string;
  versionCode: string;
  versionName: string;
  status: string;
  forecastType: string | null;
  planningCycle: { id: string; name: string };
}

interface ForecastSummaryItem {
  forecastVersion: {
    id: string;
    versionCode: string;
    versionName: string;
    status: string;
    forecastType: string | null;
    forecastMethod: string | null;
    isLocked: boolean;
    isPublished: boolean;
  };
  periods: Array<{
    periodId: string;
    periodNumber: number;
    periodName: string;
    sourceType: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    opex: number;
    operatingProfit: number;
  }>;
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMarginPercent: number;
    opex: number;
    operatingProfit: number;
    operatingMarginPercent: number;
    actualPeriodsCount: number;
    forecastPeriodsCount: number;
  };
}

export default function ForecastComparePage() {
  const [availableForecasts, setAvailableForecasts] = useState<ForecastOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparisons, setComparisons] = useState<ForecastSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    const fetchForecasts = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/forecasts');
        if (res.ok) {
          const data = await res.json();
          setAvailableForecasts(data);
          if (data.length >= 2) {
            setSelectedIds([data[0].id, data[1].id]);
          } else if (data.length === 1) {
            setSelectedIds([data[0].id]);
          }
        }
      } catch {
        setFeedback({ type: 'error', message: 'Failed to fetch forecasts.' });
      } finally {
        setLoading(false);
      }
    };
    fetchForecasts();
  }, []);

  const loadComparison = async () => {
    if (selectedIds.length === 0) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/forecasts/compare?versionIds=${selectedIds.join(',')}`);
      if (!res.ok) throw new Error('Failed to load comparison.');
      const data = await res.json();
      setComparisons(data.forecasts || []);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedIds.length > 0) {
      loadComparison();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      if (selectedIds.length > 1) {
        setSelectedIds(selectedIds.filter((item) => item !== id));
      }
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compare Forecasts"
        description="Side-by-side comparison of forecast versions across statement line items."
        actions={
          <Link href="/forecasts">
            <Button variant="outline">Back to Forecasts</Button>
          </Link>
        }
      />

      {feedback && (
        <Alert
          variant={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      )}

      {/* Version Selector Chips */}
      <Card className="p-4 bg-white border border-slate-200">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Select Versions to Compare (Choose 2 or more):
        </div>
        <div className="flex flex-wrap gap-2">
          {availableForecasts.map((f) => {
            const isSelected = selectedIds.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleSelect(f.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold ring-1 ring-blue-400'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{f.versionCode}</span>
                <span className="text-slate-400 text-[10px]">({f.planningCycle?.name})</span>
                {isSelected && <span className="text-blue-600 font-bold ml-1">✓</span>}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Comparative P&L Matrix */}
      {comparisons.length > 0 ? (
        <Card className="bg-white border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Side-by-Side P&L Summary</h3>
            <span className="text-xs font-mono text-slate-500">Currency: INR (₹)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 font-mono">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold font-sans">
                <tr>
                  <th className="py-3 px-4 min-w-[220px]">Line Item</th>
                  {comparisons.map((c) => (
                    <th key={c.forecastVersion.id} className="py-3 px-4 text-right min-w-[180px]">
                      <div className="font-bold text-slate-900">{c.forecastVersion.versionCode}</div>
                      <div className="text-[10px] text-slate-500 font-normal">{c.forecastVersion.versionName}</div>
                      <div className="mt-1">
                        <Badge variant="neutral">{c.forecastVersion.status}</Badge>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Gross Revenue */}
                <tr className="hover:bg-slate-50 font-semibold text-slate-900">
                  <td className="py-3 px-4 font-sans">Gross Revenue</td>
                  {comparisons.map((c) => (
                    <td key={c.forecastVersion.id} className="py-3 px-4 text-right">
                      ₹{c.totals.revenue.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>

                {/* COGS */}
                <tr className="hover:bg-slate-50 text-slate-700">
                  <td className="py-3 px-4 font-sans">Cost of Goods Sold (COGS)</td>
                  {comparisons.map((c) => (
                    <td key={c.forecastVersion.id} className="py-3 px-4 text-right">
                      ₹{c.totals.cogs.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>

                {/* Gross Profit */}
                <tr className="hover:bg-emerald-50/30 bg-emerald-50/15 font-bold text-emerald-950">
                  <td className="py-3 px-4 font-sans">Gross Profit</td>
                  {comparisons.map((c) => (
                    <td key={c.forecastVersion.id} className="py-3 px-4 text-right">
                      ₹{c.totals.grossProfit.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>

                {/* Gross Margin % */}
                <tr className="hover:bg-slate-50 text-slate-600 text-[11px]">
                  <td className="py-2.5 px-4 font-sans pl-6">Gross Margin %</td>
                  {comparisons.map((c) => (
                    <td key={c.forecastVersion.id} className="py-2.5 px-4 text-right">
                      {c.totals.grossMarginPercent.toFixed(2)}%
                    </td>
                  ))}
                </tr>

                {/* Operating Expense */}
                <tr className="hover:bg-slate-50 text-slate-700">
                  <td className="py-3 px-4 font-sans">Operating Expenses (Opex)</td>
                  {comparisons.map((c) => (
                    <td key={c.forecastVersion.id} className="py-3 px-4 text-right">
                      ₹{c.totals.opex.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>

                {/* Operating Profit (EBIT) */}
                <tr className="hover:bg-blue-50/30 bg-blue-50/15 font-bold text-blue-950 border-t border-b border-blue-200">
                  <td className="py-3 px-4 font-sans">Operating Profit (EBIT)</td>
                  {comparisons.map((c) => (
                    <td key={c.forecastVersion.id} className="py-3 px-4 text-right">
                      ₹{c.totals.operatingProfit.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>

                {/* Operating Margin % */}
                <tr className="hover:bg-slate-50 text-slate-600 text-[11px]">
                  <td className="py-2.5 px-4 font-sans pl-6">Operating Margin %</td>
                  {comparisons.map((c) => (
                    <td key={c.forecastVersion.id} className="py-2.5 px-4 text-right">
                      {c.totals.operatingMarginPercent.toFixed(2)}%
                    </td>
                  ))}
                </tr>

                {/* Composition counts */}
                <tr className="bg-slate-50/70 text-slate-500 text-[11px]">
                  <td className="py-2 px-4 font-sans">Period Composition</td>
                  {comparisons.map((c) => (
                    <td key={c.forecastVersion.id} className="py-2 px-4 text-right">
                      {c.totals.actualPeriodsCount} Actuals • {c.totals.forecastPeriodsCount} Forecast
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center text-slate-500 bg-white border border-slate-200">
          Select at least two forecast versions above to view side-by-side comparison.
        </Card>
      )}
    </div>
  );
}
