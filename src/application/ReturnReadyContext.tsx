// React context + hooks wiring the presentation layer to the shared,
// observable `ReturnReadyController`. This module owns no domain or
// reconciliation logic: it only creates one controller instance per
// provider, subscribes to it via `useSyncExternalStore`, and exposes small
// pure label-formatting helpers shared by multiple presentation components
// so status text stays identical everywhere it appears.

import {
  createContext,
  useContext,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type {
  EventStatus,
  FixtureSectionStatus,
  InvestmentsStatus,
} from '../domain/model';
import { createReturnReadyController, type ReturnReadyController } from './returnReadyController';

const ControllerContext = createContext<ReturnReadyController | null>(null);

export function ReturnReadyProvider({
  children,
  now,
}: {
  children: ReactNode;
  now?: () => string;
}) {
  const controllerRef = useRef<ReturnReadyController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createReturnReadyController(now ? { now } : undefined);
  }

  return (
    <ControllerContext.Provider value={controllerRef.current}>{children}</ControllerContext.Provider>
  );
}

/** Read-write access to the controller for calling domain actions. */
export function useReturnReadyController(): ReturnReadyController {
  const controller = useContext(ControllerContext);
  if (!controller) {
    throw new Error('useReturnReadyController must be used within a ReturnReadyProvider');
  }
  return controller;
}

/**
 * Subscribes to the controller's `ReturnState`. The controller only ever
 * reassigns its private `state` value on an actual mutation, so this
 * snapshot is referentially stable between notifications -- no cache is
 * needed to satisfy `useSyncExternalStore`'s stability rule.
 */
export function useReturnState() {
  const controller = useReturnReadyController();
  return useSyncExternalStore(controller.subscribe, () => controller.getState());
}

/** Subscribes to the controller's UI-only validation-modal-open flag. */
export function useValidationModalOpen(): boolean {
  const controller = useReturnReadyController();
  return useSyncExternalStore(controller.subscribe, () => controller.isValidationModalOpen());
}

// --- Shared, presentation-only label helpers --------------------------
//
// These map domain status values to the exact UI copy required by the
// design spec. They read no state and make no decisions about status --
// they only format a value the domain has already computed.

export function formatFixtureSectionStatus(_status: FixtureSectionStatus): string {
  return 'Reviewed';
}

export function formatInvestmentsStatus(status: InvestmentsStatus): string {
  switch (status) {
    case 'action-required':
      return 'Action required';
    case 'warning':
      return 'Warning: review needed';
    case 'evidence-complete-for-review':
      return 'Evidence complete for review';
    case 'unreviewed':
      return 'Not yet reconciled';
  }
}

export function formatEventStatus(status: EventStatus): { icon: string; label: string } {
  switch (status) {
    case 'action-required':
      return { icon: '⚠', label: 'Action required' };
    case 'warning':
      return { icon: '!', label: 'Needs attention (warning)' };
    case 'evidence-complete-for-review':
      return { icon: '✓', label: 'Evidence complete for review' };
    case 'unreviewed':
      return { icon: '•', label: 'Not yet reconciled' };
  }
}
