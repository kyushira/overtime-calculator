import { ModuleHeader } from '../ModuleHeader';
import { SubscriptionsView } from './SubscriptionsView';

/** The /subscriptions screen: module header, then the subscriptions view. */
export function SubscriptionsPage() {
  return (
    <div className="app-bg min-h-screen bg-page text-slate-900">
      <ModuleHeader title="Subscriptions" blurb="Active plans & cards used" />
      <main className="px-3 pt-4 pb-10 sm:px-6 sm:pt-6">
        <SubscriptionsView />
      </main>
    </div>
  );
}
