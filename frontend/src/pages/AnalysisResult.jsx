import React, { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Eye, FileText } from 'lucide-react';
import RedactionPanel from '../components/RedactionPanel.jsx';
import SummaryCard from '../components/SummaryCard.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

/**
 * ClauseCard — renders a single clause in the detailed clause-by-clause view.
 * Preserves the original App.jsx analysis feed UX.
 */
function ClauseCard({ clause, idx, isActive, setActive }) {
  const [isOpen, setIsOpen] = useState(false);
  const riskStyle = {
    HIGH: 'border-red-300 bg-red-50/20 ring-red-200/40',
    MEDIUM: 'border-yellow-300 bg-yellow-50/20 ring-yellow-200/40',
    LOW: 'border-green-200 bg-green-50/10 ring-green-100/30',
  };
  const riskBadgeStyle = {
    HIGH: 'bg-red-50 text-red-700 border-red-200',
    MEDIUM: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    LOW: 'bg-green-50 text-green-700 border-green-200',
  };

  return (
    <div
      onClick={setActive}
      className={`border rounded-2xl p-5 shadow-sm transition-all duration-300 space-y-3 cursor-pointer ${
        isActive
          ? `${riskStyle[clause.risk_level] || riskStyle.LOW} ring-1 shadow-md`
          : `${riskStyle[clause.risk_level] || riskStyle.LOW} hover:shadow-md`
      }`}
    >
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100/30 shadow-sm">
          🔹 {clause.category}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 font-mono font-medium">Section #{idx + 1}</span>
          {isActive && <Eye className="w-3 h-3 text-blue-500 animate-pulse" />}
        </div>
      </div>

      {/* Simplified Summary */}
      <div className="space-y-1">
        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Plain English Summary</span>
        <p className="text-xs text-gray-800 font-medium leading-relaxed bg-blue-50/10 border border-blue-100/20 p-3.5 rounded-xl">
          {clause.simplified_text}
        </p>
      </div>

      {/* Accordion for Original Jargon */}
      <div className="border-t border-gray-50 pt-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-wider"
        >
          {isOpen ? (
            <>Hide Original Text <ChevronUp className="w-3 h-3" /></>
          ) : (
            <>View Original Clause <ChevronDown className="w-3 h-3" /></>
          )}
        </button>

        {isOpen && (
          <p className="mt-2 text-[11px] text-gray-500 font-mono bg-gray-50 p-3 rounded-xl border border-gray-100 leading-relaxed italic">
            "{clause.original_text}"
          </p>
        )}
      </div>

      <div className="border-t border-dashed border-gray-100 pt-2 flex items-center justify-between text-[10px] text-gray-400">
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold ${riskBadgeStyle[clause.risk_level] || riskBadgeStyle.LOW}`}>
          {clause.risk_level || 'LOW'} RISK
        </span>
        {clause.risk_explanation && (
          <span className="text-[10px] text-gray-400 italic max-w-[55%] text-right leading-tight">
            {clause.risk_explanation}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AnalysisResult() {
  const location = useLocation();
  const navigate = useNavigate();
  const analysisData = location.state?.analysisData;
  const [activeClauseId, setActiveClauseId] = useState(null);
  const [showDetailView, setShowDetailView] = useState(false);
  const paragraphRefs = useRef([]);

  // If no data, redirect to dashboard
  React.useEffect(() => {
    if (!analysisData) navigate('/dashboard', { replace: true });
  }, [analysisData, navigate]);

  if (!analysisData) return null;

  const clauses = analysisData.clauses || [];

  // Auto-scroll original text when clause card is clicked
  const handleClauseClick = (index) => {
    setActiveClauseId(index);
    paragraphRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Redaction Disclosure Panel */}
        <ErrorBoundary fallbackMessage="Could not display redaction info.">
          <RedactionPanel
            redactionSummary={analysisData.redaction_summary}
            scrubbedText={analysisData.scrubbed_text}
          />
        </ErrorBoundary>

        {/* Summary Card (Main) */}
        <ErrorBoundary fallbackMessage="Could not display contract summary.">
          <SummaryCard data={analysisData} />
        </ErrorBoundary>

        {/* Detailed Clause View Toggle */}
        {clauses.length > 0 && (
          <div className="pt-4">
            <button
              onClick={() => setShowDetailView(!showDetailView)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-blue-600 transition-colors"
            >
              <FileText className="w-4 h-4" />
              {showDetailView ? 'Hide' : 'Show'} Detailed Clause-by-Clause View ({clauses.length} clauses)
              {showDetailView ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showDetailView && (
              <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1.05fr_1.25fr] gap-8 animate-in fade-in duration-200">
                {/* LEFT: Original text with highlights */}
                <div className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col shadow-sm">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <h3 className="text-xs font-bold text-gray-700 truncate">
                      {analysisData.title} — Scrubbed Text
                    </h3>
                  </div>
                  <div className="flex-1 bg-gray-50/30 border border-gray-100 p-5 rounded-xl overflow-y-auto space-y-3 max-h-[65vh]">
                    {clauses.map((clause, index) => {
                      const isHighlighted = activeClauseId === index;
                      return (
                        <p
                          key={index}
                          ref={(el) => (paragraphRefs.current[index] = el)}
                          onClick={() => setActiveClauseId(index)}
                          className={`p-3 rounded-xl text-xs font-mono leading-relaxed transition-all duration-300 cursor-pointer scroll-mt-2 ${
                            isHighlighted
                              ? 'bg-blue-50 text-blue-900 font-semibold border-l-4 border-blue-500 shadow-sm scale-[1.01]'
                              : 'text-gray-600 bg-transparent hover:bg-gray-100/50'
                          }`}
                        >
                          {clause.original_text}
                        </p>
                      );
                    })}
                  </div>
                </div>

                {/* RIGHT: Analysis cards */}
                <div className="flex flex-col space-y-4 overflow-y-auto max-h-[65vh] pr-1">
                  <div className="bg-white border border-gray-100 p-4 rounded-2xl flex justify-between items-center shadow-sm sticky top-0 z-10">
                    <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">AI Analysis Feed</span>
                    <span className="text-xs bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-full border border-blue-100/50">
                      {clauses.length} Clauses Classified
                    </span>
                  </div>
                  {clauses.map((clause, index) => (
                    <ClauseCard
                      key={clause.id || index}
                      clause={clause}
                      idx={index}
                      isActive={activeClauseId === index}
                      setActive={() => handleClauseClick(index)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
