import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KpiCard } from '../src/components/KpiCard';
import { ConnectorStatusBadge } from '../src/components/StatusBadges';

describe('Executive Portal UI Components', () => {
  it('renders Unavailable and NotLicensed states explicitly without inventing numbers', () => {
    render(
      <KpiCard
        title="Communication Compliance Alerts"
        value={null}
        availability="NotLicensed"
        source="Graph alerts_v2"
        tooltip="Alerts from Purview Communication Compliance"
      />,
    );

    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.getByText('Not Licensed')).toBeTruthy();
  });

  it('displays exact availability status badges for all Microsoft connector states', () => {
    const { container } = render(
      <div>
        <ConnectorStatusBadge status="Available" />
        <ConnectorStatusBadge status="PermissionMissing" />
        <ConnectorStatusBadge status="ApiUnsupported" />
        <ConnectorStatusBadge status="BetaDependency" />
      </div>,
    );

    expect(container.textContent).toContain('Available');
    expect(container.textContent).toContain('Permission Missing');
    expect(container.textContent).toContain('API Unsupported');
    expect(container.textContent).toContain('Beta Dependency');
  });
});
