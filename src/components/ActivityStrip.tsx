// Compact, accessible activity log. A visually-hidden `aria-live="polite"`
// region announces only the newest entry (so announcements stay concise and
// non-repetitive); the full history is rendered as an ordinary, non-live
// list alongside it.

import type { ActivityEntry } from '../domain/model';

export function ActivityStrip({ activity }: { activity: readonly ActivityEntry[] }) {
  const latest = activity.at(-1);

  return (
    <section className="activity-strip" aria-labelledby="activity-heading">
      <h2 id="activity-heading">Activity</h2>
      <div aria-live="polite" className="visually-hidden">
        {latest ? `${latest.actor === 'human' ? 'You' : 'Agent'}: ${latest.description}` : ''}
      </div>
      {activity.length === 0 ? (
        <p>No activity yet.</p>
      ) : (
        <ul>
          {activity.map((entry) => (
            <li key={entry.id}>
              <span className="activity-actor">{entry.actor === 'human' ? 'You' : 'Agent'}</span>{' '}
              {entry.description}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
