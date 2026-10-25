import React, { useEffect, useState } from 'react';
import { supabase } from './cloud/supabase';
import { ProfilePhotoButton } from './components/client/ProfilePhotoButton';
import { useSession, Profile } from './cloud/Session';
import { AuthScreen, LoadingScreen, NewPasswordScreen, NoAccessScreen } from './cloud/AuthScreen';
import { ClientsStore, SyncState, useCloudClientsStore, useLocalClientsStore } from './cloud/useClientsStore';
import { ExerciseLibraryProvider } from './state/ExerciseLibrary';
import { createClientProfile } from './lib/clients';
import {
  Users,
  BookOpen,
  ClipboardCheck,
  Dumbbell,
  LineChart,
  FileText,
  CalendarCheck,
  TrendingUp,
  Smartphone,
  Monitor,
  LogOut,
  Cloud,
  CloudOff,
  Loader2,
  UserPlus
} from 'lucide-react';
import {
  ClientProfile,
  ClientTab,
  CoachTab,
  Exercise,
  Role
} from './types';
import {
  addDays,
  adherence,
  blankWorkout,
  defaultBlockFor,
  startOfWeek,
  todayISO,
  upsertWorkout,
  workoutOn
} from './lib/workouts';
import { ClientAvatar, PureFunctionLogo } from './components/VisualAssets';
import { ClientsView } from './components/coach/ClientsView';
import { NewAssessmentView } from './components/coach/NewAssessmentView';
import { WorkoutBuilderView } from './components/coach/WorkoutBuilderView';
import { ExerciseLibraryView } from './components/coach/ExerciseLibraryView';
import { ProgressView } from './components/coach/ProgressView';
import { MonthlyReportView } from './components/coach/MonthlyReportView';
import { ClientTodayView } from './components/client/ClientTodayView';
import { ClientProgressView } from './components/client/ClientProgressView';

const COACH_NAV_ITEMS: {
  id: CoachTab;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'clients', label: 'Clients', shortLabel: 'Clients', icon: Users },
  {
    id: 'assessment',
    label: 'Assessment',
    shortLabel: 'Assess',
    icon: ClipboardCheck
  },
  {
    id: 'workout-builder',
    label: 'Workouts',
    shortLabel: 'Workouts',
    icon: Dumbbell
  },
  { id: 'library', label: 'Library', shortLabel: 'Library', icon: BookOpen },
  { id: 'progress', label: 'Progress', shortLabel: 'Progress', icon: LineChart },
  { id: 'reports', label: 'Reports', shortLabel: 'Reports', icon: FileText }
];

/* ===========================================================================
 * Entry: local demo (no cloud configured) or signed-in cloud workspace
 * ======================================================================== */

export default function App() {
  const { status, profile } = useSession();
  if (status === 'local') return <LocalApp />;
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'signed-out') return <AuthScreen />;
  if (status === 'no-access') return <NoAccessScreen />;
  if (status === 'reset') return <NewPasswordScreen />;
  return <CloudApp profile={profile!} />;
}

function LocalApp() {
  const store = useLocalClientsStore();
  return (
    <ExerciseLibraryProvider>
      <Workspace store={store} profile={null} />
    </ExerciseLibraryProvider>
  );
}

function CloudApp({ profile }: { profile: Profile }) {
  const store = useCloudClientsStore(profile);
  if (!store.loaded) return <LoadingScreen label="Loading your data…" />;
  if (store.loadError) return <LoadingScreen label={`Couldn’t load data: ${store.loadError}`} />;
  return (
    <ExerciseLibraryProvider>
      <Workspace store={store} profile={profile} />
    </ExerciseLibraryProvider>
  );
}

const SyncBadge: React.FC<{ sync: SyncState }> = ({ sync }) => {
  const map = {
    saved: { icon: <Cloud className="w-3.5 h-3.5" />, text: 'Saved', cls: 'text-gray-400' },
    saving: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, text: 'Saving…', cls: 'text-gray-500' },
    error: { icon: <CloudOff className="w-3.5 h-3.5" />, text: 'Not saved — retrying', cls: 'text-red-600' },
    offline: { icon: <CloudOff className="w-3.5 h-3.5" />, text: 'Offline — will save', cls: 'text-[#B45309]' }
  }[sync];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${map.cls}`} role="status" aria-live="polite">
      {map.icon}
      {map.text}
    </span>
  );
};

const NoClientsYet: React.FC<{ onAdd: () => void }> = ({ onAdd }) => (
  <div className="max-w-md mx-auto text-center py-20">
    <div className="w-14 h-14 rounded-2xl bg-[#FEF3C7] flex items-center justify-center mx-auto mb-4">
      <UserPlus className="w-6 h-6 text-[#B45309]" />
    </div>
    <h2 className="text-xl font-bold text-[#111827] mb-1">Add your first client</h2>
    <p className="text-sm text-gray-500 mb-5">
      Add a client with their email. When they create an account with that email, they see their own program.
    </p>
    <button onClick={onAdd} className="bg-[#111827] text-white text-sm font-semibold px-5 py-3 rounded-xl cursor-pointer">
      Go to Clients
    </button>
  </div>
);

function Workspace({ store, profile }: { store: ClientsStore; profile: Profile | null }) {
  const { signOut } = useSession();
  const { clients, setClients, sync } = store;
  const isClientUser = profile?.role === 'client';
  const [roleState, setRole] = useState<Role>(isClientUser ? 'client' : 'coach');
  const role: Role = isClientUser ? 'client' : roleState;
  const [coachTab, setCoachTab] = useState<CoachTab>('clients');
  const [clientTab, setClientTab] = useState<ClientTab>('today');
  const [selectedClientIdState, setSelectedClientId] = useState<string>(() => clients[0]?.id ?? '');
  const selectedClientId = isClientUser ? profile!.clientId ?? '' : selectedClientIdState;
  const [clientPreviewFrame, setClientPreviewFrame] = useState<boolean>(false);

  const selectedClient: ClientProfile | undefined =
    clients.find((c) => c.id === selectedClientId) || (isClientUser ? undefined : clients[0]);
  const canPreviewClient = !!selectedClient;

  // Cloud: which clients have created their account (for "Not joined · Invite").
  const [joinedIds, setJoinedIds] = useState<Set<string> | undefined>(undefined);
  useEffect(() => {
    if (!supabase || profile?.role !== 'coach' || coachTab !== 'clients') return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('client_id')
      .eq('role', 'client')
      .then(({ data }) => {
        if (!cancelled && data) setJoinedIds(new Set(data.map((r: { client_id: string }) => r.client_id)));
      });
    return () => {
      cancelled = true;
    };
  }, [profile, coachTab, clients.length]);

  // Signed in: drop the invite parameter from the address bar.
  useEffect(() => {
    if (profile && window.location.search.includes('join=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [profile]);

  const handleUpdateClient = (updated: ClientProfile) => {
    setClients((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
  };

  const handleSelectClient = (clientId: string, targetTab?: CoachTab) => {
    setSelectedClientId(clientId);
    if (targetTab) {
      setCoachTab(targetTab);
    }
  };

  const handleAddClient = (newClientData: {
    name: string;
    email: string;
    phaseNumber: 1 | 2 | 3 | 4;
    phaseName: ClientProfile['phaseName'];
  }) => {
    const created = createClientProfile(newClientData);
    setClients((prev) => [created, ...prev]);
    setSelectedClientId(created.id);
    return created.id;
  };

  const handleAddExerciseToClientWorkout = (
    clientId: string,
    date: string,
    exercise: Exercise
  ) => {
    setClients((prev) =>
      prev.map((c) => {
        if (c.id !== clientId) return c;
        const existing = workoutOn(c, date) ?? blankWorkout(date);
        return upsertWorkout(c, {
          ...existing,
          blocks: [...existing.blocks, defaultBlockFor(exercise)]
        });
      })
    );
  };

  // Weekly adherence on the Clients list comes from real workouts this week.
  const weekStart = startOfWeek(todayISO());
  const clientsWithStats = clients.map((c) => {
    const a = adherence(c, weekStart, addDays(weekStart, 6));
    return { ...c, adherenceCompleted: a.completed, adherenceTotal: a.scheduled };
  });

  return (
    <div
      className={`min-h-screen bg-[#F7F8FA] text-[#111827] flex flex-col ${
        role === 'coach' ? 'md:flex-row' : ''
      }`}
    >
      {/* =====================================================================
          COACH DESKTOP SIDEBAR (Matches Mockups 1–9)
         ===================================================================== */}
      {role === 'coach' && (
        <aside className="no-print hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-[#EAECEF] border-r border-gray-300/80 px-4 py-6 justify-between select-none z-30">
          <div>
            {/* Brand Logo placed directly above Clients */}
            <div
              onClick={() => setCoachTab('clients')}
              className="px-3 pt-1 pb-7 cursor-pointer"
            >
              <PureFunctionLogo />
            </div>

            {/* Primary Navigation Links */}
            <nav className="space-y-1.5">
              {COACH_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = coachTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCoachTab(item.id)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-full text-sm transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#111827] text-white font-semibold shadow-xs'
                        : 'text-[#1F2937] hover:text-[#111827] hover:bg-gray-300/60 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 ${
                          isActive ? 'text-white' : 'text-[#374151]'
                        }`}
                      />
                      <span className="whitespace-nowrap">{item.label}</span>
                    </div>
                    {isActive && (
                      <span className="w-2 h-2 rounded-full bg-[#FFC809] shrink-0" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom Active Client Context + Role Switcher (Coach / Client) */}
          <div className="space-y-3 pt-4 border-t border-gray-300/80">
            {selectedClient && (
              <div className="px-2 flex items-center gap-2.5">
                <ClientAvatar
                  photoUrl={selectedClient.photoUrl}
                  name={selectedClient.name}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-gray-600">Active Client</div>
                  <div className="text-xs font-semibold text-[#111827] truncate">
                    {selectedClient.name}
                  </div>
                </div>
              </div>
            )}

            {/* Role Toggle Pill (coach can preview the client's view) */}
            <div className="bg-gray-300/75 p-1 rounded-xl grid grid-cols-2 gap-1">
              <button
                onClick={() => setRole('coach')}
                className="py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer bg-white text-[#111827] shadow-2xs"
              >
                Coach
              </button>
              <button
                onClick={() => setRole('client')}
                disabled={!canPreviewClient}
                title={profile ? "Preview this client's app" : undefined}
                className="py-1.5 rounded-lg text-xs font-medium text-[#1F2937] hover:text-[#111827] disabled:opacity-40 transition-colors cursor-pointer"
              >
                Client
              </button>
            </div>

            {profile && (
              <div className="px-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#111827] truncate" title={profile.email}>
                    {profile.displayName || profile.email}
                  </div>
                  <SyncBadge sync={sync} />
                </div>
                <button
                  onClick={() => void signOut()}
                  aria-label="Sign out"
                  title="Sign out"
                  className="p-2 rounded-lg text-gray-600 hover:text-[#111827] hover:bg-gray-300/60 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* =====================================================================
          MOBILE & CLIENT TOP BAR
         ===================================================================== */}
      <header
        className={`no-print flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200/80 sticky top-0 z-30 ${
          role === 'coach' ? 'md:hidden' : 'w-full'
        }`}
      >
        <div
          onClick={() => {
            if (role === 'coach') setCoachTab('clients');
            else setClientTab('today');
          }}
          className="cursor-pointer"
        >
          <PureFunctionLogo compact />
        </div>

        <div className="flex items-center gap-2">
          {role === 'client' && (
            <button
              onClick={() => setClientPreviewFrame(!clientPreviewFrame)}
              title="Toggle mobile frame preview on desktop"
              className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#111827] bg-gray-100 px-2.5 py-1.5 rounded-lg cursor-pointer"
            >
              {clientPreviewFrame ? (
                <>
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Full width</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Phone frame</span>
                </>
              )}
            </button>
          )}

          {profile && <SyncBadge sync={sync} />}

          {role === 'client' && selectedClient && (
            <ProfilePhotoButton client={selectedClient} onUpdateClient={handleUpdateClient} />
          )}

          {profile && (
            <button
              onClick={() => void signOut()}
              aria-label="Sign out"
              title="Sign out"
              className={`p-2 rounded-lg text-gray-400 hover:text-[#111827] hover:bg-gray-100 cursor-pointer ${
                isClientUser ? '' : 'md:hidden'
              }`}
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          {/* Role Switcher in Header */}
          {!isClientUser && (
          <div className="bg-gray-100 p-0.5 rounded-xl inline-flex items-center">
            <button
              onClick={() => setRole('coach')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                role === 'coach'
                  ? 'bg-[#111827] text-white'
                  : 'text-gray-600 hover:text-[#111827]'
              }`}
            >
              Coach
            </button>
            <button
              onClick={() => setRole('client')}
              disabled={!canPreviewClient}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 ${
                role === 'client'
                  ? 'bg-[#111827] text-white'
                  : 'text-gray-600 hover:text-[#111827]'
              }`}
            >
              Client
            </button>
          </div>
          )}
        </div>
      </header>

      {/* =====================================================================
          MAIN VIEWPORT CANVAS
         ===================================================================== */}
      {role === 'coach' ? (
        <main className="flex-1 min-w-0 md:pl-60 pb-24 md:pb-12">
          <div className="px-4 sm:px-8 lg:px-12 py-6 sm:py-10">
            {coachTab === 'clients' && (
              <ClientsView
                clients={clientsWithStats}
                selectedClientId={selectedClientId}
                onSelectClient={handleSelectClient}
                onAddClient={handleAddClient}
                onUpdateClient={handleUpdateClient}
                joinedIds={joinedIds}
              />
            )}

            {coachTab !== 'clients' && coachTab !== 'library' && !selectedClient && (
              <NoClientsYet onAdd={() => setCoachTab('clients')} />
            )}

            {selectedClient && coachTab === 'assessment' && (
              <NewAssessmentView
                clients={clients}
                client={selectedClient}
                onSelectClientId={setSelectedClientId}
                onUpdateClient={handleUpdateClient}
                onFinishAssessment={() => setCoachTab('progress')}
              />
            )}

            {selectedClient && coachTab === 'workout-builder' && (
              <WorkoutBuilderView
                clients={clients}
                client={selectedClient}
                onSelectClientId={setSelectedClientId}
                onUpdateClient={handleUpdateClient}
              />
            )}

            {coachTab === 'library' && (
              <ExerciseLibraryView
                clients={clients}
                selectedClient={selectedClient}
                onAddExerciseToClientWorkout={handleAddExerciseToClientWorkout}
              />
            )}

            {selectedClient && coachTab === 'progress' && (
              <ProgressView
                clients={clients}
                client={selectedClient}
                onSelectClientId={setSelectedClientId}
                onUpdateClient={handleUpdateClient}
              />
            )}

            {selectedClient && coachTab === 'reports' && (
              <MonthlyReportView
                clients={clients}
                client={selectedClient}
                onSelectClientId={setSelectedClientId}
                onUpdateClient={handleUpdateClient}
              />
            )}
          </div>
        </main>
      ) : (
        /* CLIENT MOBILE-FIRST VIEWPORT */
        <main className="flex-1 pb-24 pt-4 px-4">
          <div
            className={
              clientPreviewFrame
                ? 'md:max-w-[430px] md:mx-auto md:bg-[#F7F8FA] md:rounded-[32px] md:border-[6px] md:border-[#111827] md:shadow-xl md:p-5 md:my-2'
                : 'max-w-xl mx-auto'
            }
          >
            {!selectedClient ? (
              <div className="text-center text-sm text-gray-500 py-20">
                Your coach is setting up your profile. Pull to refresh in a moment.
              </div>
            ) : clientTab === 'today' ? (
              <ClientTodayView
                client={selectedClient}
                onUpdateClient={handleUpdateClient}
              />
            ) : (
              <ClientProgressView client={selectedClient} onUpdateClient={handleUpdateClient} />
            )}
          </div>
        </main>
      )}

      {/* =====================================================================
          COACH MOBILE BOTTOM NAVIGATION BAR (< md)
         ===================================================================== */}
      {role === 'coach' && (
        <nav className="no-print md:hidden fixed bottom-0 inset-x-0 bg-[#EAECEF] border-t border-gray-300/80 z-40 grid grid-cols-6 px-1 py-1.5">
          {COACH_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = coachTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCoachTab(item.id)}
                className={`flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#111827] text-white font-semibold'
                    : 'text-[#1F2937] font-medium'
                }`}
              >
                <div className="relative">
                  <Icon className="w-4 h-4" />
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FFC809] absolute -top-0.5 -right-1.5" />
                  )}
                </div>
                <span className="text-[10px] mt-0.5 truncate max-w-full px-0.5">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* =====================================================================
          CLIENT BOTTOM NAVIGATION BAR (Today | My Progress)
         ===================================================================== */}
      {role === 'client' && (
        <nav className="no-print fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-40">
          <div className="max-w-md mx-auto grid grid-cols-2 gap-2 px-4 py-2">
            <button
              onClick={() => setClientTab('today')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                clientTab === 'today'
                  ? 'bg-[#111827] text-white'
                  : 'text-gray-500 hover:text-[#111827]'
              }`}
            >
              <CalendarCheck className="w-4 h-4" />
              <span>Today</span>
              {clientTab === 'today' && (
                <span className="w-2 h-2 rounded-full bg-[#FFC809]" />
              )}
            </button>

            <button
              onClick={() => setClientTab('progress')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                clientTab === 'progress'
                  ? 'bg-[#111827] text-white'
                  : 'text-gray-500 hover:text-[#111827]'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>My Progress</span>
              {clientTab === 'progress' && (
                <span className="w-2 h-2 rounded-full bg-[#FFC809]" />
              )}
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
