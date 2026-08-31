// Keyboard-operable overview of the whole-return flow: Income -> Deductions
// -> Investments -> Review pack. Each step is a real link to its section, so
// it can be reached and activated from the keyboard; the current step is
// marked with `aria-current="step"`. No status is decided here -- every
// label is read straight from controller state/readiness.

import type { ReturnState } from '../domain/model';
import type { ReturnReadiness } from '../application/returnReadyController';
import { formatFixtureSectionStatus, formatInvestmentsStatus } from '../application/ReturnReadyContext';

interface StepDefinition {
  id: ReturnState['currentStep'];
  href: string;
  label: string;
  status: string;
}

export function ReturnStepper({ state, readiness }: { state: ReturnState; readiness: ReturnReadiness }) {
  const steps: StepDefinition[] = [
    {
      id: 'income',
      href: '#income',
      label: 'Income',
      status: formatFixtureSectionStatus(state.incomeStatus),
    },
    {
      id: 'deductions',
      href: '#deductions',
      label: 'Deductions',
      status: formatFixtureSectionStatus(state.deductionsStatus),
    },
    {
      id: 'investments',
      href: '#investments',
      label: 'Investments',
      status: formatInvestmentsStatus(readiness.investmentsStatus),
    },
    {
      id: 'review-pack',
      href: '#review-pack',
      label: 'Review pack',
      status: state.reviewPackId ? 'Generated' : 'Not yet generated',
    },
  ];

  return (
    <nav aria-label="Return steps" className="return-stepper">
      <ol>
        {steps.map((step) => {
          const isCurrent = step.id === state.currentStep;
          return (
            <li key={step.id}>
              <a href={step.href} aria-current={isCurrent ? 'step' : undefined}>
                <span className="step-label">{step.label}</span>
                <span className="step-status">{step.status}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
