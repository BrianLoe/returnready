// Focus-trapped validation modal (jsdom does not implement
// HTMLDialogElement.showModal/close, so this uses a plain `role="dialog"`
// container with manual focus management rather than native <dialog>).
// Opened by `validateReviewPack` and by a blocked `generateReviewPack`;
// closing it restores focus to the caller-supplied element (the "Generate
// review pack" button). Renders only the issues it is given -- it computes
// no readiness or severity rules of its own.

import { useEffect, useRef } from 'react';
import type { ValidationIssue } from '../domain/model';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function labelFor(records: readonly { id: string; label: string }[], recordId: string): string {
  return records.find((record) => record.id === recordId)?.label ?? recordId;
}

export function ValidationModal({
  issues,
  canGenerate,
  records,
  onClose,
}: {
  issues: readonly ValidationIssue[];
  canGenerate: boolean;
  records: readonly { id: string; label: string }[];
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab' || !containerRef.current) return;

    // The heading carries tabindex="-1" (focused programmatically on open,
    // never part of the tab cycle), so the natural focusable set here is
    // exactly the modal's interactive controls (e.g. the Close button).
    const focusable = Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const blockers = issues.filter((issue) => issue.severity === 'blocker');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return (
    <div className="modal-backdrop">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="validation-modal-heading"
        className="modal"
        onKeyDown={handleKeyDown}
      >
        <h2 id="validation-modal-heading" tabIndex={-1} ref={headingRef}>
          Review pack validation
        </h2>

        {issues.length === 0 ? (
          <p>No blocking issues or warnings remain.</p>
        ) : (
          <>
            {blockers.length > 0 && (
              <section aria-labelledby="validation-blockers-heading">
                <h3 id="validation-blockers-heading">Blocking issues</h3>
                <ul>
                  {blockers.map((issue) => (
                    <li key={issue.id} id={`issue-${issue.id}`}>
                      <strong>{labelFor(records, issue.eventId)}</strong> — <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {warnings.length > 0 && (
              <section aria-labelledby="validation-warnings-heading">
                <h3 id="validation-warnings-heading">Warnings</h3>
                <ul>
                  {warnings.map((issue) => (
                    <li key={issue.id} id={`issue-${issue.id}`}>
                      <strong>{labelFor(records, issue.eventId)}</strong> — <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p>
          {canGenerate
            ? 'No blocking issues remain. You may generate the review pack.'
            : 'Resolve the blocking issue(s) above before generating the review pack.'}
        </p>

        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
