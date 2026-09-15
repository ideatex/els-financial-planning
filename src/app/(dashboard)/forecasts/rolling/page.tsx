'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';

interface ForecastItem {
  id: string;
  versionCode: string;
  versionName: string;
  forecastType: string | null;
  status: string;
  planningCycle: { id: string; name: string };
  actualsCutoffPeriod: { id: string; periodName: string; periodNumber: number } | null;
  forecastHorizonStart: { id: string; periodName: string; periodNumber: number } | null;
  forecastHorizonEnd: { id: string; periodName: string; periodNumber: number } | null;
}

export default function RollingForecastPage() {
  const router = useRouter();
  const [forecasts, setForecasts] = useState<ForecastItem[]>([]);
  const [selectedForecastId, setSelectedForecastId] = useState<string>('');
  const [advancePeriods, setAdvancePeriods] = useState<number>(1);
  const [extendPeriods, setExtendPeriods] = useState<number>(1);
  const [newCode, setNewCode] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    const fetchForecasts = async () => {
      try {
        const res = await fetch('/api/forecasts');
        if (res.ok) {
          const data = await res.json();
          setForecasts(data);
          if (data.length > 0) {
            setSelectedForecastId(data[0].id);
            setNewCode(`${data[0].versionCode}-ROLL`);
            setNewName(`Rolling Forecast — ${data[0].versionName}`);
          }
        }
      } catch {
        setFeedback({ type: 'error', message: 'Failed to fetch forecasts.' });
      }
    };
    fetchForecasts();
  }, []);

  const selectedForecast = forecasts.find((f) => f.id === selectedForecastId);

  const handleSourceChange = (id: string) => {
    setSelectedForecastId(id);
    const f = forecasts.find((item) => item.id === id);
    if (f) {
      setNewCode(`${f.versionCode}-ROLL`);
      setNewName(`Rolling Forecast — ${f.versionName}`);
    }
  };

  const handleGenerateRolling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForecastId) return;

    try {
      setGenerating(true);
      const res = await fetch(`/api/forecasts/${selectedForecastId}/rolling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          code: newCode,
          description,
          advanceCutoffByPeriods: advancePeriods,
          extendHorizonByPeriods: extendPeriods,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to generate rolling forecast.');
      }

      const created = await res.json();
      setFeedback({ type: 'success', message: `Rolling forecast ${created.versionCode} created successfully!` });
      setTimeout(() => {
        router.push(`/forecasts/${created.id}`);
      }, 1200);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const currentCutoffNum = selectedForecast?.actualsCutoffPeriod?.periodNumber ?? 1;
  const currentEndNum = selectedForecast?.forecastHorizonEnd?.periodNumber ?? 12;

  const nextCutoffNum = currentCutoffNum + advancePeriods;
  const nextEndNum = currentEndNum + extendPeriods;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rolling Forecasts"
        description="Advance actuals cutoff periods and extend projection horizons."
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

      {/* Configuration & Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Settings */}
        <div className="lg:col-span-6 space-y-6">
          <Card className="p-5 bg-white border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Rolling Horizon Configuration</h3>
            <form onSubmit={handleGenerateRolling} className="space-y-4">
              <Select
                label="Source Forecast Baseline *"
                value={selectedForecastId}
                onChange={(e) => handleSourceChange(e.target.value)}
                options={forecasts.map((f) => ({
                  value: f.id,
                  label: `${f.versionCode} — ${f.versionName} (${f.planningCycle?.name})`,
                }))}
                required
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Advance Cutoff (Periods) *"
                  type="number"
                  min={1}
                  max={6}
                  value={advancePeriods.toString()}
                  onChange={(e) => setAdvancePeriods(parseInt(e.target.value) || 1)}
                  required
                />
                <Input
                  label="Extend Horizon (Periods) *"
                  type="number"
                  min={0}
                  max={12}
                  value={extendPeriods.toString()}
                  onChange={(e) => setExtendPeriods(parseInt(e.target.value) || 0)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="New Rolling Code *"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  required
                />
                <Input
                  label="New Rolling Name *"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>

              <Input
                label="Description & Rolling Notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Rolling M+1 iteration with latest actual inventory and sales reconciliation"
              />

              <div className="pt-2">
                <Button type="submit" className="w-full" disabled={generating}>
                  {generating ? 'Advancing Horizon & Generating...' : 'Generate Rolling Forecast'}
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Right Column: Visual Horizon Progression Preview */}
        <div className="lg:col-span-6 space-y-6">
          <Card className="p-5 bg-white border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Horizon Progression</h3>
            <p className="text-xs text-slate-500 mb-5">
              Comparison of current cutoff versus proposed rolling horizon.
            </p>

            {selectedForecast ? (
              <div className="space-y-6">
                {/* Baseline Timeline */}
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold mb-2 text-slate-700">
                    <span>Current Baseline: {selectedForecast.versionCode}</span>
                    <span className="text-slate-500">
                      Cutoff: P{currentCutoffNum} • End: P{currentEndNum}
                    </span>
                  </div>
                  <div className="grid grid-cols-12 gap-1 p-2 bg-slate-50 border border-slate-200 rounded">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((pNum) => {
                      const isActual = pNum <= currentCutoffNum;
                      const inHorizon = pNum <= currentEndNum;
                      return (
                        <div
                          key={pNum}
                          className={`p-2 text-center rounded text-[10px] font-bold ${
                            !inHorizon
                              ? 'bg-slate-100 text-slate-300'
                              : isActual
                              ? 'bg-blue-600 text-white'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          P{pNum}
                          <div className="text-[8px] font-normal uppercase">
                            {isActual ? 'Act' : inHorizon ? 'Fcst' : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Proposed Rolling Timeline */}
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold mb-2 text-slate-700">
                    <span className="text-blue-900 font-bold">New Rolling Horizon: {newCode || 'PROPOSED'}</span>
                    <span className="text-blue-700 font-bold">
                      Cutoff: P{nextCutoffNum} (+{advancePeriods}) • End: P{nextEndNum} (+{extendPeriods})
                    </span>
                  </div>
                  <div className="grid grid-cols-12 gap-1 p-2 bg-blue-50/40 border border-blue-200 rounded">
                    {Array.from({ length: Math.max(12, nextEndNum) }, (_, i) => i + 1).slice(0, 12).map((pNum) => {
                      const isActual = pNum <= nextCutoffNum;
                      const isNewlyActual = pNum > currentCutoffNum && pNum <= nextCutoffNum;
                      const inHorizon = pNum <= nextEndNum;
                      return (
                        <div
                          key={pNum}
                          className={`p-2 text-center rounded text-[10px] font-bold ${
                            !inHorizon
                              ? 'bg-slate-100 text-slate-300'
                              : isNewlyActual
                              ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                              : isActual
                              ? 'bg-blue-600 text-white'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          P{pNum}
                          <div className="text-[8px] font-normal uppercase">
                            {isNewlyActual ? 'NEW' : isActual ? 'Act' : inHorizon ? 'Fcst' : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Summary Delta Banner */}
                <div className="p-3.5 bg-slate-50 rounded border border-slate-200 text-xs space-y-1.5">
                  <div className="font-semibold text-slate-900">Governance & Lineage Preservation:</div>
                  <div className="text-slate-600">
                    • <strong>Historical Immutability:</strong> The parent baseline ({selectedForecast.versionCode}) remains frozen and intact.
                  </div>
                  <div className="text-slate-600">
                    • <strong>Period Reclassification:</strong> Period {nextCutoffNum} shifts from <code>FORECAST</code> to <code>ACTUAL</code> upon import of actual manufacturing batches.
                  </div>
                  <div className="text-slate-600">
                    • <strong>Continuous Visibility:</strong> Horizon extends to maintain full continuous multi-quarter planning visibility.
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400">Select a source forecast to preview rolling progression.</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
