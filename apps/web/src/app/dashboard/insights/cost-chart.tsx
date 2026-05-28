'use client';

// Cost/token insights — a Recharts line of daily cost over the window plus a
// tabbed breakdown table (total / by project / by harness). Recharts is
// client-only (touches window) so this whole component is 'use client' and
// the chart is wrapped in ResponsiveContainer.

import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CostTrend } from '@/lib/api/insights';

type BreakdownTab = 'project' | 'harness';

export function CostChart({ trend }: { trend: CostTrend }) {
  const [tab, setTab] = useState<BreakdownTab>('project');

  const chartData = trend.daily.map((d) => ({
    day: d.day.slice(5), // MM-DD
    cost: Number(d.cost.toFixed(6)),
    tokens: d.tokens,
  }));

  return (
    <div className="space-y-6" data-testid="insights-cost-chart">
      <section>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat
            label={`Total cost (${trend.days}d)`}
            value={`$${trend.totalCost.toFixed(4)}`}
            testId="insights-total-cost"
          />
          <Stat
            label="Total tokens"
            value={trend.totalTokens.toLocaleString()}
            testId="insights-total-tokens"
          />
          <Stat
            label="Avg / day"
            value={`$${(trend.totalCost / Math.max(1, trend.days)).toFixed(4)}`}
            testId="insights-avg-cost"
          />
        </div>
        <div className="h-64 w-full" data-testid="insights-chart-area">
          {chartData.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              이 기간에 실행된 run 이 없습니다.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip
                  formatter={(v: number) => [`$${v}`, 'cost']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <nav className="mb-3 flex gap-1 border-b border-border" data-testid="insights-tabs">
          <TabButton
            active={tab === 'project'}
            onClick={() => setTab('project')}
            testId="insights-tab-project"
          >
            By project
          </TabButton>
          <TabButton
            active={tab === 'harness'}
            onClick={() => setTab('harness')}
            testId="insights-tab-harness"
          >
            By harness
          </TabButton>
        </nav>

        {tab === 'project' ? (
          <BreakdownTable
            testId="insights-breakdown-project"
            rows={trend.byProject.map((p) => ({
              key: p.projectId,
              label: p.repoFullName,
              cost: p.cost,
              tokens: p.tokens,
              runs: p.runs,
            }))}
          />
        ) : (
          <BreakdownTable
            testId="insights-breakdown-harness"
            rows={trend.byHarness.map((h) => ({
              key: h.harnessId,
              label: h.name,
              cost: h.cost,
              tokens: h.tokens,
              runs: h.runs,
            }))}
          />
        )}
      </section>
    </div>
  );
}

interface BreakdownRow {
  key: string;
  label: string;
  cost: number;
  tokens: number;
  runs: number;
}

function BreakdownTable({ rows, testId }: { rows: BreakdownRow[]; testId: string }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
        데이터 없음.
      </p>
    );
  }
  return (
    <table className="w-full text-sm" data-testid={testId}>
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2">Name</th>
          <th className="py-2 text-right">Cost</th>
          <th className="py-2 text-right">Tokens</th>
          <th className="py-2 text-right">Runs</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-border/50" data-testid={`${testId}-row`}>
            <td className="py-2">{r.label}</td>
            <td className="py-2 text-right font-mono">${r.cost.toFixed(4)}</td>
            <td className="py-2 text-right font-mono">{r.tokens.toLocaleString()}</td>
            <td className="py-2 text-right font-mono">{r.runs}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-md border border-border px-4 py-3" data-testid={testId}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-active={active ? '1' : '0'}
      className={
        'border-b-2 px-3 py-2 text-sm transition-colors ' +
        (active
          ? 'border-foreground font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground')
      }
    >
      {children}
    </button>
  );
}
