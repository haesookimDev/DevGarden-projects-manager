import type { Config } from 'tailwindcss';

import preset from '@devgarden/ui/tailwind-preset';

const config: Config = {
  presets: [preset as Config],
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};

export default config;
