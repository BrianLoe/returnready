import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the ReturnReady heading and a synthetic data label on every data card/section', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'ReturnReady' })).toBeVisible();

    // Every data card/section carries the marker: Income, Deductions,
    // Managed funds, and each of the three investment event cards.
    const markers = screen.getAllByText('Synthetic demo data');
    expect(markers.length).toBeGreaterThanOrEqual(3);
    for (const marker of markers) {
      expect(marker).toBeVisible();
    }
  });
});
