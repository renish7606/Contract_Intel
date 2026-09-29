import { ExternalLink, Scale } from 'lucide-react';

export default function LegalContextBox({
  text,
  sources = [],
}) {
  if (!text) {
    return null;
  }

  const safeSources = Array.isArray(sources)
    ? sources.filter(Boolean)
    : [];

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-100">
          <Scale className="w-4 h-4 text-purple-700" />
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
            Legal Context
          </div>

          <div className="text-[10px] text-purple-500">
            External legal / regulatory research
          </div>
        </div>
      </div>

      <p className="text-xs text-purple-950 leading-relaxed">
        {text}
      </p>

      {safeSources.length > 0 && (
        <div className="pt-2 border-t border-purple-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-purple-600 mb-2">
            Sources
          </div>

          <div className="space-y-1.5">
            {safeSources.slice(0, 5).map((url, index) => (
              <a
                key={`${url}-${index}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-[10px] text-purple-700 hover:text-purple-900 hover:underline break-all"
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span>
                  Source {index + 1}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
