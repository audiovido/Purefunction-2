import React, { useState } from 'react';
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
  Monitor
} from 'lucide-react';
import {
  ClientProfile,
  ClientTab,
  CoachTab,
  DayWorkout,
  Exercise,
  Role,
  WorkoutExerciseBlock
} from './types';
import { INITIAL_CLIENTS } from './data/mockData';
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

export default function App() {
  const [role, setRole] = useState<Role>('coach');
  const [coachTab, setCoachTab] = useState<CoachTab>('clients');
  const [clientTab, setClientTab] = useState<ClientTab>('today');
  const [clients, setClients] = useState<ClientProfile[]>(INITIAL_CLIENTS);
  const [selectedClientId, setSelectedClientId] = useState<string>(
    INITIAL_CLIENTS[0].id
  );
  const [clientPreviewFrame, setClientPreviewFrame] = useState<boolean>(false);

  const selectedClient =
    clients.find((c) => c.id === selectedClientId) || clients[0];

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
    const template = INITIAL_CLIENTS[0];
    const created: ClientProfile = {
      ...template,
      id: `client-${Date.now()}`,
      name: newClientData.name,
      email: newClientData.email,
      avatarId: 'alex',
      phaseNumber: newClientData.phaseNumber,
      phaseName: newClientData.phaseName,
      currentWeek: 0,
      adherenceCompleted: 0,
      adherenceTotal: 6,
      nextAssessmentDays: 0
    };
    setClients((prev) => [created, ...prev]);
    setSelectedClientId(created.id);
    setCoachTab('assessment');
  };

  const handleAddExerciseToClientWorkout = (
    clientId: string,
    dayKey: DayWorkout['dayKey'],
    exercise: Exercise
  ) => {
    setClients((prev) =>
      prev.map((c) => {
        if (c.id !== clientId) return c;
        const defaultLoad =
          exercise.equipment === 'Bodyweight' ||
          exercise.equipment === 'Foam Roller'
            ? 0
            : 25;
        const newBlock: WorkoutExerciseBlock = {
          id: `blk-${Date.now()}`,
          exerciseId: exercise.id,
          name: exercise.name,
          sets: 3,
          targetReps: 8,
          loadKg: defaultLoad,
          restSec: 60,
          cue: exercise.cues[0] || 'Keep ribs stacked over pelvis',
          lastTimeLoadKg: defaultLoad > 0 ? defaultLoad - 2.5 : 0,
          lastTimeRepsPerSet: [8, 8, 8],
          loggedSets: [
            { setNumber: 1, kg: defaultLoad, reps: 8, completed: false },
            { setNumber: 2, kg: defaultLoad, reps: 8, completed: false },
            { setNumber: 3, kg: defaultLoad, reps: 8, completed: false }
          ]
        };

        return {
          ...c,
          weeklyWorkouts: c.weeklyWorkouts.map((day) =>
            day.dayKey === dayKey
              ? { ...day, isRestDay: false, blocks: [...day.blocks, newBlock] }
              : day
          )
        };
      })
    );
  };

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
        <aside className="no-print hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-[#F4F5F7] border-r border-gray-200/80 px-4 py-6 justify-between select-none z-30">
          <div>
            {/* Brand Logo */}
            <div
              onClick={() => setCoachTab('clients')}
              className="px-2 mb-8 cursor-pointer"
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
                        ? 'bg-[#111827] text-white font-medium shadow-xs'
                        : 'text-gray-600 hover:text-[#111827] hover:bg-gray-200/50 font-normal'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 ${
                          isActive ? 'text-white' : 'text-gray-500'
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
          <div className="space-y-3 pt-4 border-t border-gray-200/80">
            <div className="px-2 flex items-center gap-2.5">
              <ClientAvatar
                avatarId={selectedClient.avatarId}
                name={selectedClient.name}
                size="sm"
              />
              <div className="min-w-0">
                <div className="text-[11px] text-gray-400">Active Client</div>
                <div className="text-xs font-semibold text-[#111827] truncate">
                  {selectedClient.name}
                </div>
              </div>
            </div>

            {/* Role Toggle Pill */}
            <div className="bg-gray-200/80 p-1 rounded-xl grid grid-cols-2 gap-1">
              <button
                onClick={() => setRole('coach')}
                className="py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer bg-white text-[#111827] shadow-2xs"
              >
                Coach
              </button>
              <button
                onClick={() => setRole('client')}
                className="py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-[#111827] transition-colors cursor-pointer"
              >
                Client
              </button>
            </div>
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
          <PureFunctionLogo />
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

          {/* Role Switcher in Header */}
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
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                role === 'client'
                  ? 'bg-[#111827] text-white'
                  : 'text-gray-600 hover:text-[#111827]'
              }`}
            >
              Client
            </button>
          </div>
        </div>
      </header>

      {/* =====================================================================
          MAIN VIEWPORT CANVAS
         ===================================================================== */}
      {role === 'coach' ? (
        <main className="flex-1 md:pl-60 pb-24 md:pb-12">
          <div className="px-4 sm:px-8 lg:px-12 py-6 sm:py-10">
            {coachTab === 'clients' && (
              <ClientsView
                clients={clients}
                selectedClientId={selectedClientId}
                onSelectClient={handleSelectClient}
                onAddClient={handleAddClient}
              />
            )}

            {coachTab === 'assessment' && (
              <NewAssessmentView
                clients={clients}
                client={selectedClient}
                onSelectClientId={setSelectedClientId}
                onUpdateClient={handleUpdateClient}
                onFinishAssessment={() => setCoachTab('progress')}
              />
            )}

            {coachTab === 'workout-builder' && (
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

            {coachTab === 'progress' && (
              <ProgressView
                clients={clients}
                client={selectedClient}
                onSelectClientId={setSelectedClientId}
              />
            )}

            {coachTab === 'reports' && (
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
            {clientTab === 'today' ? (
              <ClientTodayView
                client={selectedClient}
                onUpdateClient={handleUpdateClient}
              />
            ) : (
              <ClientProgressView client={selectedClient} />
            )}
          </div>
        </main>
      )}

      {/* =====================================================================
          COACH MOBILE BOTTOM NAVIGATION BAR (< md)
         ===================================================================== */}
      {role === 'coach' && (
        <nav className="no-print md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-40 grid grid-cols-6 px-1 py-1.5">
          {COACH_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = coachTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCoachTab(item.id)}
                className={`flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                  isActive ? 'text-[#111827] font-semibold' : 'text-gray-400'
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
