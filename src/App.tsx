import { useEffect, useRef, useState } from 'react';
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
import { registerReturnReadyTools } from './webmcp/registerTools';

const demoNow = () => '2026-06-30T00:00:00.000Z';

function ReturnReadyApp() {
  const controller = useReturnReadyController();
  const state = useReturnState();
  const modalOpen = useValidationModalOpen();
  const readiness = controller.getReturnReadiness();

  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const [lastValidation, setLastValidation] = useState<ValidationSummary | null>(null);
  const [webmcpAvailable, setWebmcpAvailable] = useState<boolean | null>(null);

  // Registers the six WebMCP tools against the same controller instance the
  // manual UI above uses. Runs once per mount (the controller identity is
  // stable for the life of the provider); the effect's cleanup aborts the
  // registration on unmount and on Vite hot-reload of this component, and a
  // later mount registers again from scratch. Fails safe: when WebMCP is
  // unavailable, `registerReturnReadyTools` returns `available: false`
  // without throwing, and the manual UI above is entirely unaffected either
  // way.
  useEffect(() => {
    const { available, controller: abortController } = registerReturnReadyTools(controller);
    setWebmcpAvailable(available);
    return () => abortController.abort();
  }, [controller]);

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
      // The pack now lives in application state (`state.reviewPack`), which
      // the controller's `notify()` (triggered above when `result.changed`)
      // re-renders from -- no local state to set here.
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
    <>
      <header className="product-header">
        <div className="product-header__inner">
          <h1 className="product-wordmark"><span>Return</span>Ready</h1>
        </div>
      </header>
      <main>
      <h2 className="page-title">Prepare your 2025–26 return evidence</h2>
      <p className="page-intro">
        Evidence-first preparation for your investment disposals. ReturnReady does not lodge returns or
        provide tax advice.
      </p>
      {webmcpAvailable === false && (
        <p className="webmcp-status">
          WebMCP unavailable in this browser — manual controls below remain fully available.
        </p>
      )}

      <ReturnStepper state={state} readiness={readiness} />

      <section id="income" className="return-section return-section--summary" aria-labelledby="income-heading">
        <h2 id="income-heading">Income</h2>
        <p className="reviewed-status"><span aria-hidden="true">✓</span> {formatFixtureSectionStatus(state.incomeStatus)}</p>
        <p>PAYG income statement summary.</p>
      </section>

      <section id="deductions" className="return-section return-section--summary" aria-labelledby="deductions-heading">
        <h2 id="deductions-heading">Deductions</h2>
        <p className="reviewed-status"><span aria-hidden="true">✓</span> {formatFixtureSectionStatus(state.deductionsStatus)}</p>
        <p>Work-related deduction summary.</p>
      </section>

      <section
        id="investments"
        className="return-section return-section--primary"
        aria-labelledby="investments-heading"
      >
        <div className="section-heading">
          <p className="section-kicker">Active review area</p>
          <h2 id="investments-heading">Investments</h2>
        </div>

        <aside className="agent-workflow-callout" aria-labelledby="agent-workflow-heading">
          <h3 id="agent-workflow-heading">Complete the evidence your way</h3>
          <p>
            Complete the missing details yourself, or ask your browser agent to reconcile the imported
            evidence, record the missing acquisition details, and prepare the review pack.
          </p>
          <p className="agent-workflow-callout__note">
            Agent actions use the same controls and appear in the audit trail below.
          </p>
        </aside>

        <section className="asset-group" aria-labelledby="foreign-shares-heading">
          <h3 id="foreign-shares-heading">Imported foreign-share disposals</h3>
          <div className="investment-list">
            {foreignShareEvents.map((event) => (
              <InvestmentCard key={event.id} event={event} />
            ))}
          </div>
        </section>

        <section className="asset-group" aria-labelledby="crypto-assets-heading">
          <h3 id="crypto-assets-heading">Imported crypto disposals</h3>
          <div className="investment-list">
            {cryptoEvents.map((event) => (
              <InvestmentCard key={event.id} event={event} />
            ))}
          </div>
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

      <section id="review-pack" className="return-section" aria-labelledby="review-pack-section-heading">
        <h2 id="review-pack-section-heading">Review pack</h2>
        {state.reviewPack ? (
          <ReviewPackView pack={state.reviewPack} events={state.events} />
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
    </>
  );
}

export default function App() {
  return (
    <ReturnReadyProvider now={demoNow}>
      <ReturnReadyApp />
    </ReturnReadyProvider>
  );
}
