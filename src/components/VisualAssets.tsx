import React from 'react';
import { Exercise } from '../types';

export const PureFunctionLogo: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div className="flex items-center gap-3 select-none">
    <div className="relative w-7 h-7 rounded-full bg-[#FEF6D8] flex items-center justify-center overflow-hidden shrink-0">
      {/* Bottom-left yellow quadrant/wedge matching the mockup logo */}
      <svg viewBox="0 0 28 28" className="w-7 h-7">
        <circle cx="14" cy="14" r="14" fill="#FDF3C7" />
        <path d="M 14 14 L 14 28 A 14 14 0 0 1 0 14 Z" fill="#FFC809" />
        <path d="M 14 14 L 2 20 A 14 14 0 0 1 0 14 Z" fill="#F5B800" />
      </svg>
    </div>
    {!compact && (
      <span className="text-[17px] font-semibold tracking-tight text-[#111827] whitespace-nowrap">
        Pure Function
      </span>
    )}
  </div>
);

export const ClientAvatar: React.FC<{
  avatarId: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ avatarId, name, size = 'md' }) => {
  const dims =
    size === 'sm' ? 'w-9 h-9 text-xs' : size === 'lg' ? 'w-14 h-14 text-base' : 'w-11 h-11 text-sm';

  const palettes: Record<
    string,
    { bg: string; skin: string; hair: string; shirt: string; accent: string }
  > = {
    alex: {
      bg: '#E5E7EB',
      skin: '#E0AC8B',
      hair: '#27201C',
      shirt: '#1F2937',
      accent: '#FFC809'
    },
    sarah: {
      bg: '#F3E8E2',
      skin: '#F1C6A7',
      hair: '#5C3A21',
      shirt: '#374151',
      accent: '#FFC809'
    },
    marcus: {
      bg: '#E2E8F0',
      skin: '#8D5524',
      hair: '#1A110B',
      shirt: '#111827',
      accent: '#FFC809'
    },
    elena: {
      bg: '#ECEFF3',
      skin: '#F5D0B5',
      hair: '#1E1B18',
      shirt: '#1E293B',
      accent: '#FFC809'
    },
    daniel: {
      bg: '#E5E7EB',
      skin: '#EAC09E',
      hair: '#111827',
      shirt: '#0F172A',
      accent: '#FFC809'
    },
    olivia: {
      bg: '#EFECE6',
      skin: '#ECC4A6',
      hair: '#6D4C3D',
      shirt: '#334155',
      accent: '#FFC809'
    }
  };

  const p = palettes[avatarId] || {
    bg: '#E5E7EB',
    skin: '#E0AC8B',
    hair: '#1F2937',
    shirt: '#111827',
    accent: '#FFC809'
  };

  const isFemale = ['sarah', 'elena', 'olivia'].includes(avatarId);

  return (
    <div
      className={`${dims} rounded-full overflow-hidden shrink-0 bg-[#E5E7EB] border border-gray-200/80 flex items-center justify-center relative`}
      title={name}
    >
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" fill={p.bg} />
        {/* Shoulders / Shirt */}
        <path d="M10 64 C10 47, 54 47, 54 64 Z" fill={p.shirt} />
        {/* Neck */}
        <rect x="27" y="36" width="10" height="10" rx="4" fill={p.skin} />
        {/* Long Hair Back for female */}
        {isFemale && <path d="M17 26 C15 40, 17 50, 21 53 L43 53 C47 50, 49 40, 47 26 Z" fill={p.hair} />}
        {/* Head */}
        <ellipse cx="32" cy="27" rx="11.5" ry="13.5" fill={p.skin} />
        {/* Hair Top */}
        {isFemale ? (
          <path
            d="M20 25 C20 13, 44 13, 44 25 C41 19, 34 18, 28 20 C24 21, 21 24, 20 25 Z"
            fill={p.hair}
          />
        ) : (
          <path
            d="M20.5 24 C20.5 13, 43.5 13, 43.5 24 C41 19, 23 19, 20.5 24 Z"
            fill={p.hair}
          />
        )}
        {/* Eyes & Smile */}
        <circle cx="28" cy="27" r="1.3" fill="#111827" />
        <circle cx="36" cy="27" r="1.3" fill="#111827" />
        <path
          d="M28.5 33 Q32 35.8 35.5 33"
          stroke="#111827"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

export const InBodyPrintoutThumbnail: React.FC<{ fileName?: string }> = ({ fileName }) => (
  <div className="w-28 bg-white rounded-lg border border-gray-200 shadow-sm p-2.5 text-left select-none mx-auto">
    <div className="flex items-center justify-between border-b border-gray-200 pb-1 mb-1.5">
      <span className="text-[9px] font-bold tracking-tight text-[#111827]">InBody</span>
      <span className="text-[6px] text-gray-400 font-mono">270</span>
    </div>
    <div className="grid grid-cols-3 gap-1 mb-1.5">
      <div className="h-1.5 bg-gray-200 rounded-sm" />
      <div className="h-1.5 bg-gray-100 rounded-sm" />
      <div className="text-[8px] font-bold text-right text-[#111827] leading-none">81</div>
    </div>
    <div className="space-y-1 mb-2">
      <div className="flex items-center gap-1">
        <div className="w-5 h-1 bg-gray-300 rounded-sm" />
        <div className="h-1 w-10 bg-[#111827] rounded-sm" />
      </div>
      <div className="flex items-center gap-1">
        <div className="w-5 h-1 bg-gray-300 rounded-sm" />
        <div className="h-1 w-12 bg-[#FFC809] rounded-sm" />
      </div>
      <div className="flex items-center gap-1">
        <div className="w-5 h-1 bg-gray-300 rounded-sm" />
        <div className="h-1 w-7 bg-gray-400 rounded-sm" />
      </div>
    </div>
    <div className="border-t border-gray-100 pt-1 grid grid-cols-2 gap-1">
      <div className="h-1 bg-gray-200 rounded-sm" />
      <div className="h-1 bg-gray-200 rounded-sm" />
      <div className="h-1 bg-gray-200 rounded-sm" />
      <div className="h-1 bg-gray-200 rounded-sm" />
    </div>
    {fileName && (
      <div className="mt-1.5 pt-1 border-t border-gray-100 text-[7px] text-gray-400 truncate">
        {fileName}
      </div>
    )}
  </div>
);

export const InBodySegmentSilhouette: React.FC<{
  segments: {
    leftArm: number;
    rightArm: number;
    trunk: number;
    leftLeg: number;
    rightLeg: number;
  };
  onChangeSegment?: (
    key: 'leftArm' | 'rightArm' | 'trunk' | 'leftLeg' | 'rightLeg',
    value: number
  ) => void;
}> = ({ segments, onChangeSegment }) => {
  return (
    <div className="relative flex flex-col items-center justify-center py-2 select-none">
      <div className="relative w-[230px] h-[320px] flex items-center justify-center">
        {/* Clean anatomical outline matching Mockups 3, 4, 7, 8 */}
        <svg viewBox="0 0 200 310" className="w-full h-full">
          {/* Body silhouette outline */}
          <path
            d="M100 14
               C109 14, 115 21, 115 31
               C115 39, 111 45, 108 49
               L109 55
               C122 58, 134 62, 139 72
               C143 82, 146 105, 150 124
               L156 147
               C158 152, 162 156, 164 160
               C162 162, 158 160, 156 158
               C157 164, 159 170, 157 172
               C155 173, 153 168, 152 165
               C151 169, 149 173, 147 172
               C146 171, 147 166, 147 162
               C145 164, 143 166, 142 164
               C141 162, 143 155, 143 149
               L136 122
               C133 108, 130 95, 127 86
               L123 130
               C125 144, 128 160, 127 182
               C126 206, 123 228, 121 248
               C119 266, 118 279, 120 288
               C122 293, 125 297, 123 299
               C119 301, 111 300, 109 296
               C107 291, 108 279, 107 262
               C106 242, 105 218, 103 196
               L100 182
               L97 196
               C95 218, 94 242, 93 262
               C92 279, 93 291, 91 296
               C89 300, 81 301, 77 299
               C75 297, 78 293, 80 288
               C82 279, 81 266, 79 248
               C77 228, 74 206, 73 182
               C72 160, 75 144, 77 130
               L73 86
               C70 95, 67 108, 64 122
               L57 149
               C57 155, 59 162, 58 164
               C57 166, 55 164, 53 162
               C53 166, 54 171, 53 172
               C51 173, 49 169, 48 165
               C47 168, 45 173, 43 172
               C41 170, 43 164, 44 158
               C42 160, 38 162, 36 160
               C38 156, 42 152, 44 147
               L50 124
               C54 105, 57 82, 61 72
               C66 62, 78 58, 91 55
               L92 49
               C89 45, 85 39, 85 31
               C85 21, 91 14, 100 14 Z"
            fill="#F3F4F6"
            stroke="#111827"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />

          {/* Dashed Segment Separation Lines matching InBody 270 diagram */}
          {/* Left Shoulder */}
          <line
            x1="70"
            y1="62"
            x2="75"
            y2="92"
            stroke="#6B7280"
            strokeWidth="1.1"
            strokeDasharray="3 3"
          />
          {/* Right Shoulder */}
          <line
            x1="130"
            y1="62"
            x2="125"
            y2="92"
            stroke="#6B7280"
            strokeWidth="1.1"
            strokeDasharray="3 3"
          />
          {/* Left Pelvis/Leg crease */}
          <line
            x1="75"
            y1="154"
            x2="100"
            y2="174"
            stroke="#6B7280"
            strokeWidth="1.1"
            strokeDasharray="3 3"
          />
          {/* Right Pelvis/Leg crease */}
          <line
            x1="125"
            y1="154"
            x2="100"
            y2="174"
            stroke="#6B7280"
            strokeWidth="1.1"
            strokeDasharray="3 3"
          />
        </svg>

        {/* Left Arm Label */}
        <div className="absolute left-0 top-[102px] text-right">
          {onChangeSegment ? (
            <label className="inline-flex items-center gap-0.5 text-[13px] font-medium text-[#111827] tabular-nums bg-white/90 px-1.5 py-0.5 rounded border border-transparent hover:border-gray-300 focus-within:border-[#111827]">
              <input
                type="number"
                step="0.1"
                value={segments.leftArm}
                onChange={(e) => onChangeSegment('leftArm', parseFloat(e.target.value) || 0)}
                className="w-9 text-right bg-transparent focus:outline-none tabular-nums"
                aria-label="Left Arm Lean Mass kg"
              />
              <span>kg</span>
            </label>
          ) : (
            <span className="text-[13px] font-medium text-[#111827] tabular-nums">
              {segments.leftArm} kg
            </span>
          )}
        </div>

        {/* Right Arm Label */}
        <div className="absolute right-0 top-[102px] text-left">
          {onChangeSegment ? (
            <label className="inline-flex items-center gap-0.5 text-[13px] font-medium text-[#111827] tabular-nums bg-white/90 px-1.5 py-0.5 rounded border border-transparent hover:border-gray-300 focus-within:border-[#111827]">
              <input
                type="number"
                step="0.1"
                value={segments.rightArm}
                onChange={(e) => onChangeSegment('rightArm', parseFloat(e.target.value) || 0)}
                className="w-9 text-right bg-transparent focus:outline-none tabular-nums"
                aria-label="Right Arm Lean Mass kg"
              />
              <span>kg</span>
            </label>
          ) : (
            <span className="text-[13px] font-medium text-[#111827] tabular-nums">
              {segments.rightArm} kg
            </span>
          )}
        </div>

        {/* Trunk Label (Centered inside torso) */}
        <div className="absolute top-[118px] left-1/2 -translate-x-1/2 text-center">
          {onChangeSegment ? (
            <label className="inline-flex items-center gap-0.5 text-[12.5px] font-semibold text-[#111827] tabular-nums bg-white/80 px-1 rounded border border-transparent hover:border-gray-300 focus-within:border-[#111827]">
              <input
                type="number"
                step="0.1"
                value={segments.trunk}
                onChange={(e) => onChangeSegment('trunk', parseFloat(e.target.value) || 0)}
                className="w-10 text-center bg-transparent focus:outline-none tabular-nums"
                aria-label="Trunk Lean Mass kg"
              />
              <span>kg</span>
            </label>
          ) : (
            <span className="text-[13px] font-medium text-[#111827] tabular-nums">
              {segments.trunk} kg
            </span>
          )}
        </div>

        {/* Left Leg Label */}
        <div className="absolute left-2 bottom-[66px] text-right">
          {onChangeSegment ? (
            <label className="inline-flex items-center gap-0.5 text-[13px] font-medium text-[#111827] tabular-nums bg-white/90 px-1.5 py-0.5 rounded border border-transparent hover:border-gray-300 focus-within:border-[#111827]">
              <input
                type="number"
                step="0.1"
                value={segments.leftLeg}
                onChange={(e) => onChangeSegment('leftLeg', parseFloat(e.target.value) || 0)}
                className="w-9 text-right bg-transparent focus:outline-none tabular-nums"
                aria-label="Left Leg Lean Mass kg"
              />
              <span>kg</span>
            </label>
          ) : (
            <span className="text-[13px] font-medium text-[#111827] tabular-nums">
              {segments.leftLeg} kg
            </span>
          )}
        </div>

        {/* Right Leg Label */}
        <div className="absolute right-2 bottom-[66px] text-left">
          {onChangeSegment ? (
            <label className="inline-flex items-center gap-0.5 text-[13px] font-medium text-[#111827] tabular-nums bg-white/90 px-1.5 py-0.5 rounded border border-transparent hover:border-gray-300 focus-within:border-[#111827]">
              <input
                type="number"
                step="0.1"
                value={segments.rightLeg}
                onChange={(e) => onChangeSegment('rightLeg', parseFloat(e.target.value) || 0)}
                className="w-9 text-right bg-transparent focus:outline-none tabular-nums"
                aria-label="Right Leg Lean Mass kg"
              />
              <span>kg</span>
            </label>
          ) : (
            <span className="text-[13px] font-medium text-[#111827] tabular-nums">
              {segments.rightLeg} kg
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const ExerciseIllustration: React.FC<{
  type: Exercise['illustrationType'];
  className?: string;
}> = ({ type, className = 'w-full h-40' }) => {
  return (
    <div
      className={`${className} rounded-xl overflow-hidden bg-[#D8DCE3] relative flex items-center justify-center select-none`}
    >
      <svg viewBox="0 0 320 200" className="w-full h-full object-cover">
        {/* Clean studio gym background: white wall, black squat rack uprights, dark rubber floor */}
        <rect width="320" height="135" fill="#E5E7EB" />
        {/* Studio rack uprights */}
        <rect x="26" y="0" width="8" height="135" fill="#1F2937" />
        <rect x="292" y="0" width="7" height="135" fill="#1F2937" />
        {/* Gym floor */}
        <rect y="135" width="320" height="65" fill="#26292E" />
        {/* Gym mat */}
        <rect x="35" y="148" width="250" height="10" rx="3" fill="#111827" />

        {type === 'hip-lift' && (
          <g>
            {/* Foam roller under knees */}
            <circle cx="195" cy="140" r="10" fill="#111827" />
            {/* Supine athlete doing 90/90 hip lift */}
            {/* Head */}
            <circle cx="88" cy="136" r="11" fill="#E0AC8B" />
            <path d="M77 136 C77 125, 96 125, 96 134 Z" fill="#4B3621" />
            {/* Torso on mat */}
            <path
              d="M98 140 L165 135 L168 147 L98 148 Z"
              fill="#6B7280"
            />
            {/* Pelvis lifted slightly + Thighs */}
            <path
              d="M162 136 L208 110 L216 118 L170 146 Z"
              fill="#111827"
            />
            {/* Lower legs angled to floor/box */}
            <path
              d="M208 110 L245 140 L238 146 L202 118 Z"
              fill="#E0AC8B"
            />
            {/* Shoes */}
            <rect x="238" y="138" width="18" height="9" rx="4" fill="#4B5563" />
            {/* Yellow biomechanical cue arc at pelvis */}
            <path
              d="M158 124 Q170 112 182 120"
              stroke="#FFC809"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        )}

        {type === 'goblet-squat' && (
          <g>
            {/* Rack uprights behind */}
            <rect x="78" y="0" width="6" height="135" fill="#1F2937" />
            <rect x="236" y="0" width="6" height="135" fill="#1F2937" />
            {/* Athlete in deep symmetrical goblet squat facing front */}
            {/* Legs */}
            <path
              d="M138 115 L118 118 L122 152 L134 152 L134 128 L160 130 L186 128 L186 152 L198 152 L202 118 L182 115 Z"
              fill="#111827"
            />
            {/* Torso */}
            <rect x="138" y="68" width="44" height="50" rx="10" fill="#6B7280" />
            {/* Head */}
            <circle cx="160" cy="48" r="13" fill="#E0AC8B" />
            <path d="M148 44 C148 32, 172 32, 172 44 Z" fill="#2D231E" />
            {/* Arms holding dumbbell vertically at chest */}
            <path
              d="M138 74 L128 96 L150 96 M182 74 L192 96 L170 96"
              stroke="#E0AC8B"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Dumbbell at sternum */}
            <rect x="151" y="72" width="18" height="7" rx="2" fill="#111827" />
            <rect x="156" y="79" width="8" height="14" fill="#374151" />
            <rect x="151" y="93" width="18" height="7" rx="2" fill="#111827" />
            {/* Yellow vertical stack indicator */}
            <line
              x1="160"
              y1="62"
              x2="160"
              y2="142"
              stroke="#FFC809"
              strokeWidth="2"
              strokeDasharray="3 3"
            />
          </g>
        )}

        {type === 'clam' && (
          <g>
            {/* Side-lying athlete on mat */}
            <circle cx="88" cy="116" r="11" fill="#F1C6A7" />
            {/* Supporting arm */}
            <path
              d="M82 126 L72 145 L98 145"
              stroke="#F1C6A7"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Torso */}
            <path d="M98 126 L166 132 L164 147 L96 144 Z" fill="#6B7280" />
            {/* Bottom leg */}
            <path
              d="M164 140 L216 146 L252 144"
              stroke="#111827"
              strokeWidth="12"
              strokeLinecap="round"
              fill="none"
            />
            {/* Top leg abducted (Clam open) */}
            <path
              d="M164 136 L210 114 L248 140"
              stroke="#1F2937"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Yellow abduction arc */}
            <path
              d="M214 140 A 26 26 0 0 0 212 112"
              stroke="#FFC809"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        )}

        {type === 'hip-rotation' && (
          <g>
            {/* Quadruped active hip rotation */}
            <circle cx="226" cy="96" r="11" fill="#F1C6A7" />
            {/* Supporting right arm on mat */}
            <line
              x1="208"
              y1="104"
              x2="208"
              y2="148"
              stroke="#F1C6A7"
              strokeWidth="7"
              strokeLinecap="round"
            />
            {/* Torso */}
            <path d="M148 92 L212 96 L210 112 L146 110 Z" fill="#6B7280" />
            {/* Supporting knee on mat */}
            <path
              d="M152 106 L152 146 L112 146"
              stroke="#111827"
              strokeWidth="11"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Elevated rotating hip/leg */}
            <path
              d="M150 96 L116 86 L124 58"
              stroke="#1F2937"
              strokeWidth="11"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="150" cy="96" r="4" fill="#FFC809" />
          </g>
        )}

        {(type === 'rdl' ||
          type === 'belly-lift' ||
          type === 'split-squat' ||
          type === 'landmine-press' ||
          type === 'wall-squat' ||
          type === 'pallof-press') && (
          <g>
            {/* Athletic hinge / unilateral movement silhouette */}
            <circle cx="196" cy="68" r="12" fill="#E0AC8B" />
            {/* Hinged / stacked torso */}
            <path d="M136 92 L184 72 L190 88 L142 108 Z" fill="#4B5563" />
            {/* Hips & Legs */}
            <path
              d="M138 102 L148 148 M144 102 L122 148"
              stroke="#111827"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Arms + Barbell/Load */}
            <line
              x1="176"
              y1="82"
              x2="176"
              y2="128"
              stroke="#E0AC8B"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <circle cx="176" cy="130" r="14" fill="#111827" stroke="#FFC809" strokeWidth="2.5" />
          </g>
        )}
      </svg>
    </div>
  );
};
