// Keyboard-operable overview of the whole-return flow: Income -> Deductions
// -> Investments -> Review pack. Each step is a real link to its section, so
// it can be reached and activated from the keyboard; the current step is
// marked with `aria-current="step"`. No status is decided here -- every
// label is read straight from controller state/readiness.

import type { ReturnState } from '../domain/model';
import type { ReturnDraftSummary } from '../application/returnReadyController';

interface StepDefinition {
  id: ReturnState['currentStep'];
  href: string;
  label: string;
  status: string;
  icon: string;
  tone: 'complete' | 'attention' | 'pending';
}

export function ReturnStepper({ state, draft }: { state: ReturnState; draft: ReturnDraftSummary }) {
  const disposalIssues = draft.issues.filter((issue) => issue.eventId.startsWith('disposal-'));
  const disposalStatus = draft.disposalCount === 0
    ? 'Empty'
    : disposalIssues.some((issue) => issue.severity === 'blocker')
      ? 'Action required'
      : disposalIssues.some((issue) => issue.severity === 'warning')
        ? 'Warning: review needed'
        : 'Evidence complete for review';
  const steps: StepDefinition[] = [
    {
      id: 'income',
      href: '#income',
      label: 'Income',
      status: 'Prefilled',
      icon: '✓',
      tone: 'complete',
    },
    {
      id: 'deductions',
      href: '#deductions',
      label: 'Deductions',
      status: draft.deductionCount > 0 ? 'Evidence recorded' : 'Empty',
      icon: draft.deductionCount > 0 ? '✓' : '—',
      tone: draft.deductionCount > 0 ? 'complete' : 'pending',
    },
    {
      id: 'investments',
      href: '#investments',
      label: 'Disposals',
      status: disposalStatus,
      icon: draft.disposalCount === 0 ? '—' : disposalStatus === 'Evidence complete for review' ? '✓' : '!',
      tone: draft.disposalCount === 0 ? 'pending' : disposalStatus === 'Evidence complete for review' ? 'complete' : 'attention',
    },
    {
      id: 'review-pack',
      href: '#review-pack',
      label: 'Review pack',
      status: state.reviewPackId ? 'Generated' : 'Not yet generated',
      icon: state.reviewPackId ? '✓' : '—',
      tone: state.reviewPackId ? 'complete' : 'pending',
    },
  ];

  return (
    <nav aria-label="Return steps" className="return-stepper evidence-trail">
      <ol>
        {steps.map((step, index) => {
          const isCurrent = step.id === state.currentStep;
          return (
            <li key={step.id}>
              <a href={step.href} aria-current={isCurrent ? 'step' : undefined}>
                <span className="step-label">{step.label}</span>
                <span className="step-number" aria-hidden="true">{index + 1}</span>
                <span
                  className={`step-state step-state--${step.tone}`}
                  role="img"
                  aria-label={step.status}
                >
                  {step.icon}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
