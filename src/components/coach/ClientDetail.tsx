import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ClientProfile, ClientSection, Exercise } from '../../types';
import { ClientAvatar } from '../VisualAssets';
import { FULL_FEATURES, isBasicClientSection } from '../../lib/basicMode';
import { WorkoutBuilderView } from './WorkoutBuilderView';
import { NewAssessmentView } from './NewAssessmentView';
import { MonthlyReportView } from './MonthlyReportView';
import { ProgressView } from './ProgressView';
import { AssessmentHistory } from './AssessmentHistory';
import { GoalsPanel } from './GoalsPanel';
import { NotesPanel } from './NotesPanel';
import { WorkoutHistory } from './WorkoutHistory';
import { BodyLab } from '../BodyLab';
import { PostureOverview } from './PostureOverview';
import { NutritionPanel } from '../NutritionPanel';
import { FoodDiary } from '../FoodDiary';
import { AssessmentSummary } from './AssessmentSummary';
import { SpectrumOfPatterns } from './SpectrumOfPatterns';

export const SECTIONS: { id: ClientSection; label: string }[] = [
  { id: 'exercises', label: 'Exercises' },
  { id: 'assessment', label: 'Assessment' },
  { id: 'notes', label: 'Notes' },
  { id: 'goals', label: 'Goals' },
  { id: 'progression', label: 'Progression' },
  { id: 'nutrition', label: 'Nutrition' }
];

type AsSub = 'overview' | 'new' | 'report';

const Sub: React.FC<{ items: { id: string; label: string }[]; value: string; onChange: (v: string) => void }> = ({ items, value, onChange }) => (
  <div className="flex flex-wrap min-w-0 gap-2 mb-5 no-print">
    {items.map((i) => (
      <button
        key={i.id}
        onClick={() => onChange(i.id)}
        className={`min-h-[44px] px-4 py-2 rounded-full text-[13px] font-semibold border whitespace-nowrap cursor-pointer transition-colors ${
          value === i.id ? 'bg-[#FFC809] border-[#FFC809] text-[#111827]' : 'bg-white border-gray-200 text-gray-600 hover:text-[#111827]'
        }`}
      >
        {i.label}
      </button>
    ))}
  </div>
);

/** One client: header + rounded tabs. Everything about this client lives here. */
export const ClientDetail: React.FC<{
  client: ClientProfile;
  section: ClientSection;
  onSection: (s: ClientSection) => void;
  onBack: () => void;
  onUpdateClient: (c: ClientProfile) => void;
  onAddExercise: (clientId: string, date: string, exercise: Exercise) => void;
}> = ({ client, section, onSection, onBack, onUpdateClient, onAddExercise }) => {
  const [asSub, setAsSub] = useState<AsSub>('overview');
  const one = [client];
  const noop = () => {};
  const assessments = client.assessments ?? [];

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0">
      <div className="flex items-center gap-3 mb-5 no-print">
        <button onClick={onBack} aria-label="All clients" className="w-11 h-11 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 cursor-pointer shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <ClientAvatar name={client.name} photoUrl={client.photoUrl} />
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827] truncate">{client.name}</h1>
          <p className="text-sm text-gray-500 truncate">
            Week {client.currentWeek} · Phase {client.phaseNumber} · {client.phaseName}
            {client.email ? ` · ${client.email}` : ''}
          </p>
        </div>
      </div>

      <div className="min-w-0 mb-5 no-print">
        <div className="flex flex-wrap gap-1 bg-[#E5E7EB] rounded-2xl p-1.5">
          {SECTIONS.filter(s => FULL_FEATURES || isBasicClientSection(s.id)).map((s) => (
            <button
              key={s.id}
              onClick={() => onSection(s.id)}
              className={`min-h-[44px] px-4 sm:px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                section === s.id ? 'bg-[#111827] text-white shadow-sm' : 'text-gray-600 hover:text-[#111827]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pf-embed">
        {section === 'exercises' && (
          <>
            <WorkoutBuilderView clients={one} client={client} onSelectClientId={noop} onUpdateClient={onUpdateClient} />
            <details className="pf-workout-history mt-6 bg-white rounded-[28px] border border-gray-100 p-4 sm:p-6">
              <summary className="min-h-[44px] flex items-center cursor-pointer text-base font-bold text-[#111827]">Past workouts</summary>
              <div className="mt-4">
                <WorkoutHistory client={client} />
              </div>
            </details>
          </>
        )}

        {FULL_FEATURES && section === 'assessment' && (
          <>
            <Sub
              items={[
                { id: 'overview', label: 'Posture Overview' },
                { id: 'new', label: assessments.length ? 'New assessment' : 'Start assessment' },
                { id: 'report', label: 'Reports' }
              ]}
              value={asSub}
              onChange={(v) => setAsSub(v as AsSub)}
            />
            {asSub === 'overview' && (
              <>
                <AssessmentSummary client={client} />
                <SpectrumOfPatterns client={client} onUpdateClient={onUpdateClient} />
                <BodyLab client={client} onUpdateClient={onUpdateClient} />
                <PostureOverview client={client} onUpdateClient={onUpdateClient} coach />
                {assessments.length > 0 ? (
                  <AssessmentHistory key={client.id} assessments={assessments} client={client} onUpdateClient={onUpdateClient} />
                ) : (
                  <div className="bg-white rounded-[28px] border border-gray-100 p-6 text-sm text-gray-500">
                    No completed assessment yet.{' '}
                    <button onClick={() => setAsSub('new')} className="font-semibold text-[#111827] underline cursor-pointer">
                      Start the first one
                    </button>
                  </div>
                )}
              </>
            )}
            {asSub === 'new' && (
              <NewAssessmentView clients={one} client={client} onSelectClientId={noop} onUpdateClient={onUpdateClient} onFinishAssessment={() => setAsSub('overview')} />
            )}
            {asSub === 'report' && <MonthlyReportView clients={one} client={client} onSelectClientId={noop} onUpdateClient={onUpdateClient} />}
          </>
        )}

        {section === 'notes' && <NotesPanel client={client} onUpdateClient={onUpdateClient} />}

        {FULL_FEATURES && section === 'goals' && (
          <GoalsPanel
            goals={client.goals ?? []}
            assessments={assessments}
            onDelete={(id) => onUpdateClient({ ...client, goals: (client.goals ?? []).filter((g) => g.id !== id) })}
            emptyText="No goals yet. Open Assessment › Posture Overview and tap the note icon next to any measure to set a goal."
          />
        )}

        {FULL_FEATURES && section === 'progression' && <ProgressView clients={one} client={client} onSelectClientId={noop} onUpdateClient={onUpdateClient} />}

        {FULL_FEATURES && section === 'nutrition' && <FoodDiary clientId={client.id} mode="coach" legacy={<NutritionPanel client={client} onUpdateClient={onUpdateClient} />} legacyPlan={client.nutrition} />}
      </div>
    </div>
  );
};
