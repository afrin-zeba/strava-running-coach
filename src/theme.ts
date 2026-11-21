import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';

export const milemarkTheme = defineTheme({
  name: 'milemark',
  extends: neutralTheme,
  tokens: {
    '--color-accent': ['#ba4927', '#f19170'],
    '--color-text-accent': ['#ba4927', '#f19170'],
    '--color-accent-muted': ['#f6e6df', '#493026'],
    '--color-on-accent': ['#ffffff', '#251b16'],
    '--color-background-body': ['#f8f7f4', '#181b19'],
    '--color-background-surface': ['#ffffff', '#222622'],
    '--color-background-card': ['#ffffff', '#222622'],
    '--color-background-popover': ['#ffffff', '#272b27'],
    '--color-background-muted': ['#f0f0eb', '#2b302b'],
    '--color-text-primary': ['#272d27', '#f1f2ec'],
    '--color-text-secondary': ['#657064', '#b2baad'],
    '--color-background-orange': ['#faeee6', '#362b25'],
    '--color-text-orange': ['#8f3e23', '#f4b38e'],
    '--color-background-green': ['#eef2e8', '#283326'],
    '--color-text-green': ['#4d6740', '#b0c99b'],
    '--font-family-heading': '"Aime", Georgia, "Times New Roman", serif',
    '--radius-container': '1rem',
  },
});
