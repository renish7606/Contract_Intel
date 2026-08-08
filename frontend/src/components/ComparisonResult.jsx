import { ArrowLeftRight, CheckCircle2, Minus, TrendingDown, TrendingUp } from 'lucide-react';

const STATUS_STYLE = {
  added: 'border-green-200 bg-green-50',
  removed: 'border-red-200 bg-red-50',
  modified: 'border-yellow-200 bg-yellow-50',
};

const DIRECTION_STYLE = {
  MORE_RISKY: { label: 'More risky', icon: TrendingUp, className: 'text-red-700 bg-red-100' },
  LESS_RISKY: { label: 'Less risky', icon: TrendingDown, className: 'text-green-700 bg-green-100' },
  NEUTRAL: { label: 'Neutral impact', icon: Minus, className: 'text-gray-600 bg-gray-100' },
};

export default function ComparisonResult({ data }) {
  const changes = data?.changes || [];
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="w-5 h-5 text-blue-600" />
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Version Comparison</p>
            <h1 className="text-lg font-semibold text-gray-900">Contract changes and risk impact</h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-gray-600">{data?.overall_change_summary}</p>
      </div>

      <div className="p-6 space-y-4">
        {changes.length === 0 ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 flex items-center gap-3 text-green-800">
            <CheckCircle2 className="w-5 h-5" />
            <p className="text-sm font-medium">The matching clauses are unchanged across these versions.</p>
          </div>
        ) : changes.map((change, index) => {
          const direction = DIRECTION_STYLE[change.impact_direction] || DIRECTION_STYLE.NEUTRAL;
          const DirectionIcon = direction.icon;
          return (
            <div key={`${change.category}-${index}`} className={`rounded-xl border p-4 ${STATUS_STYLE[change.status] || STATUS_STYLE.modified}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="font-semibold text-gray-900">{change.category}</h2>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-black/5 bg-white/70 px-2 py-1 text-[10px] font-bold uppercase text-gray-600">{change.status}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${direction.className}`}>
                    <DirectionIcon className="w-3 h-3" /> {direction.label}
                  </span>
                </div>
              </div>
              {change.status === 'modified' && (
                <div className="rounded-lg bg-white/70 p-3 text-sm leading-7 text-gray-700">
                  {change.diff?.map((part, partIndex) => (
                    <span key={partIndex} className={part.type === 'added' ? 'bg-green-200 text-green-950' : part.type === 'removed' ? 'bg-red-200 text-red-950 line-through' : ''}>
                      {part.text}{' '}
                    </span>
                  ))}
                </div>
              )}
              {change.status !== 'modified' && (
                <p className="rounded-lg bg-white/70 p-3 text-sm leading-7 text-gray-700">{change.status === 'added' ? change.v2_text : change.v1_text}</p>
              )}
              <p className="mt-3 text-sm text-gray-700"><span className="font-semibold">Impact: </span>{change.explanation}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
