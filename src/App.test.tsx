import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the ReturnReady heading and synthetic data label', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'ReturnReady' })).toBeVisible();
    expect(screen.getByText('Synthetic demo data')).toBeVisible();
  });
});
