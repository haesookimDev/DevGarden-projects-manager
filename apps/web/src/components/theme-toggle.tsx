'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '@devgarden/ui';

const order = ['light', 'dark', 'system'] as const;
type Theme = (typeof order)[number];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const current = (mounted ? (theme as Theme | undefined) : undefined) ?? 'system';
  const next = order[(order.indexOf(current) + 1) % order.length];

  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;
  const label = `Theme: ${current}. Click to switch to ${next}.`;

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
