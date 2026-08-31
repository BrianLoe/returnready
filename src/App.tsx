import { useMemo, useRef, useState } from 'react';
import type { ValidationSummary } from './application/returnReadyController';
import {
  ReturnReadyProvider,
  useReturnReadyController,
  useReturnState,
  useValidationModalOpen,
  formatFixtureSectionStatus,
} from './application/ReturnReadyContext';
import { ReturnStepper } from './components/ReturnStepper';
import { InvestmentCard } from './components/InvestmentCard';
import { ActivityStrip } from './components/ActivityStrip';
import { ValidationModal } from './components/ValidationModal';
import { ReviewPackView } from './components/ReviewPackView';

function ReturnReadyApp() {
  const controller = useReturnReadyController();
  const state = useReturnState();
  const modalOpen = useValidationModalOpen();
  const readiness = controller.getReturnReadiness();

  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const [lastValidation, setLastValidation] = useState<ValidationSummary | null>(null);

  // Derived from the controller, not local state: once `state.reviewPackId`
  // is set, `generateReviewPack` is idempotent (see `src/domain/reviewPack.ts`
  // -- the `state.reviewPackId === REVIEW_PACK_ID` branch returns
  // `changed: false` and performs no clone, no activity entry, and no
  // notify), so calling it here is side-effect-free and keeps this view in
  // sync with any other actor (including a future WebMCP tool call) that
  // generates the pack in the same tab.
  const reviewPack = useMemo(() => {
    if (!state.reviewPackId) return null;
    const result = controller.generateReviewPack('human');
    return result.ok ? result.value.pack : null;
  }, [state.reviewPackId, controller]);

  const managedFundEvidence = state.evidence.find(
    (item) => item.sourceType === 'managed-fund-statement' && item.facts.kind === 'managed-fund-statement',
  );
  const foreignShareEvents = state.events.filter((event) => event.assetClass === 'foreign-share');
  const cryptoEvents = state.events.filter((event) => event.assetClass === 'crypto');

  function refreshValidation() {
    const result = controller.validateReviewPack('human');
    if (result.ok) setLastValidation(result.value);
  }

  function handleReconcile() {
    controller.reconcileInvestmentEvidence(
      state.events.map((event) => event.id),
      'human',
    );
  }

  function handleValidate() {
    refreshValidation();
  }

  function handleGenerate() {
    const result = controller.generateReviewPack('human');
    if (result.ok) {
      // The `reviewPack` memo derives from `state.reviewPackId`, which the
      // controller's `notify()` (triggered above when `result.changed`) will
      // cause to re-render with -- no local state to set here.
      setLastValidation(null);
    } else {
      refreshValidation();
    }
  }

  function handleCloseModal() {
    controller.closeValidationModal();
    generateButtonRef.current?.focus();
  }

  function handleReset() {
    controller.reset();
    setLastValidation(null);
  }

  return (
    <main>
      <h1>ReturnReady</h1>
      <p>
        Evidence-first preparation for your investment disposals. ReturnReady does not lodge returns or
        provide tax advice.
      </p>

      <ReturnStepper state={state} readiness={readiness} />

      <section id="income" aria-labelledby="income-heading">
        <h2 id="income-heading">Income</h2>
        <p>{formatFixtureSectionStatus(state.incomeStatus)}</p>
        <p>PAYG income statement summary.</p>
        <p className="synthetic-marker">Synthetic demo data</p>
      </section>

      <section id="deductions" aria-labelledby="deductions-heading">
        <h2 id="deductions-heading">Deductions</h2>
        <p>{formatFixtureSectionStatus(state.deductionsStatus)}</p>
        <p>Work-related deduction summary.</p>
        <p className="synthetic-marker">Synthetic demo data</p>
      </section>

      <section id="investments" aria-labelledby="investments-heading">
        <h2 id="investments-heading">Investments</h2>

        <article className="investment-card" aria-labelledby="managed-funds-heading">
          <h3 id="managed-funds-heading">Managed funds</h3>
          <p>{formatFixtureSectionStatus('previously-reviewed')}</p>
          {managedFundEvidence && managedFundEvidence.facts.kind === 'managed-fund-statement' && (
            <dl>
              <div>
                <dt>Holdings</dt>
                <dd>{managedFundEvidence.facts.holdingCount}</dd>
              </div>
            </dl>
          )}
          <p className="synthetic-marker">Synthetic demo data</p>
        </article>

        <section aria-labelledby="foreign-shares-heading">
          <h3 id="foreign-shares-heading">Foreign shares</h3>
          {foreignShareEvents.map((event) => (
            <InvestmentCard key={event.id} event={event} />
          ))}
        </section>

        <section aria-labelledby="crypto-assets-heading">
          <h3 id="crypto-assets-heading">Crypto assets</h3>
          {cryptoEvents.map((event) => (
            <InvestmentCard key={event.id} event={event} />
          ))}
        </section>

        <div className="action-bar">
          <button type="button" onClick={handleReconcile}>
            Reconcile investment evidence
          </button>
          <button type="button" onClick={handleValidate}>
            Validate review pack
          </button>
          <button type="button" ref={generateButtonRef} onClick={handleGenerate}>
            Generate review pack
          </button>
          <button type="button" onClick={handleReset}>
            Reset demo
          </button>
        </div>
      </section>

      <ActivityStrip activity={state.activity} />

      <section id="review-pack" aria-labelledby="review-pack-section-heading">
        <h2 id="review-pack-section-heading">Review pack</h2>
        {reviewPack ? (
          <ReviewPackView pack={reviewPack} events={state.events} />
        ) : (
          <p>No review pack has been generated yet.</p>
        )}
      </section>

      {modalOpen && (
        <ValidationModal
          issues={lastValidation?.issues ?? []}
          canGenerate={lastValidation?.canGenerate ?? readiness.canGenerate}
          events={state.events}
          onClose={handleCloseModal}
        />
      )}
    </main>
  );
}

export default function App() {
  return (
    <ReturnReadyProvider>
      <ReturnReadyApp />
    </ReturnReadyProvider>
  );
}
