import { useEffect, useRef, useState } from 'react';
import {
  ReturnReadyProvider,
  useReturnReadyController,
  useReturnState,
  useValidationModalOpen,
} from './application/ReturnReadyContext';
import { ReturnStepper } from './components/ReturnStepper';
import { ActivityStrip } from './components/ActivityStrip';
import { ValidationModal } from './components/ValidationModal';
import { ReviewPackView } from './components/ReviewPackView';
import { DeductionForm } from './components/DeductionForm';
import { DeductionList } from './components/DeductionList';
import { DisposalForm } from './components/DisposalForm';
import { DisposalList } from './components/DisposalList';
import { registerReturnReadyTools } from './webmcp/registerTools';

const demoNow = () => '2026-06-30T00:00:00.000Z';

function ReturnReadyApp() {
  const controller = useReturnReadyController();
  const state = useReturnState();
  const modalOpen = useValidationModalOpen();
  const draft = controller.getReturnDraft();

  const generateButtonRef = useRef<HTMLButtonElement>(null);
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

  function handleValidate() {
    controller.validateReviewPack('human');
  }

  function handleGenerate() {
    controller.generateReviewPack('human');
  }

  function handleCloseModal() {
    controller.closeValidationModal();
    generateButtonRef.current?.focus();
  }

  function handleReset() {
    controller.reset();
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
        Turn scattered deduction worksheets and investment statements into an evidence-linked draft.
        ReturnReady does not lodge returns or provide tax advice.
      </p>
      {webmcpAvailable === false && (
        <p className="webmcp-status">
          WebMCP unavailable in this browser — manual controls below remain fully available.
        </p>
      )}

      <ReturnStepper state={state} draft={draft} />

      <aside className="agent-workflow-callout" aria-labelledby="agent-workflow-heading">
        <h2 id="agent-workflow-heading">Populate this draft manually or with Codex</h2>
        <p>
          Add entries manually, or ask Codex to populate this draft from synthetic evidence attached
          in your conversation. ReturnReady receives structured facts only—not files or raw text.
        </p>
        <p className="agent-workflow-callout__note">
          Agent actions use the same domain controls and appear in the audit trail.
        </p>
      </aside>

      <section id="income" className="return-section return-section--summary" aria-labelledby="income-heading">
        <h2 id="income-heading">Income</h2>
        <p className="reviewed-status"><span aria-hidden="true">✓</span> Prefilled context</p>
        <p>{state.incomeSummary.description}</p>
      </section>

      <section id="deductions" className="return-section return-section--primary" aria-labelledby="deductions-heading">
        <h2 id="deductions-heading">Deductions</h2>
        <p>{draft.deductionCount} evidence-backed deduction entr{draft.deductionCount === 1 ? 'y' : 'ies'} recorded.</p>
        <DeductionList entries={state.deductions} />
        <DeductionForm />
      </section>

      <section
        id="investments"
        className="return-section return-section--primary"
        aria-labelledby="investments-heading"
      >
        <div className="section-heading">
          <p className="section-kicker">FY2025–26</p>
          <h2 id="investments-heading">Investment disposals</h2>
        </div>
        <p>{draft.disposalCount} disposal record{draft.disposalCount === 1 ? '' : 's'} recorded.</p>
        <DisposalList entries={state.disposals} issues={draft.issues} />
        <DisposalForm />

        <div className="action-bar">
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
          <ReviewPackView pack={state.reviewPack} />
        ) : (
          <p>No review pack has been generated yet.</p>
        )}
      </section>

      {modalOpen && (
        <ValidationModal
          issues={draft.issues}
          canGenerate={draft.canGenerate}
          records={[
            ...state.deductions.map((entry) => ({ id: entry.id, label: entry.description })),
            ...state.disposals.map((entry) => ({ id: entry.id, label: entry.symbol })),
          ]}
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
