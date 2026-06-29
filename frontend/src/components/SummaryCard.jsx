import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  Shield,
  Upload,
} from 'lucide-react';
import { jsPDF } from 'jspdf';

const RISK_STYLES = {
  HIGH: {
    badge: 'bg-red-100 text-red-700 border-red-200',
    label: 'HIGH RISK',
  },
  MEDIUM: {
    badge: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    label: 'MEDIUM RISK',
  },
  LOW: {
    badge: 'bg-green-100 text-green-700 border-green-200',
    label: 'LOW RISK',
  },
};

const EMPTY_FACTS = {
  contract_type: 'Not specified',
  payment: 'Not specified',
  duration: 'Not specified',
  termination: 'Not specified',
  dispute_resolution: 'Not specified',
};

function normalizeClause(clause) {
  return {
    name: clause.name || clause.category || 'Important Clause',
    plain_explanation:
      clause.plain_explanation ||
      clause.simplified_text ||
      'This means you should review this clause before signing.',
    risk_level: (clause.risk_level || 'MEDIUM').toUpperCase(),
  };
}

export default function SummaryCard({ data }) {
  const navigate = useNavigate();
  const [standardExpanded, setStandardExpanded] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  if (!data) return null;

  const {
    title,
    executive_summary,
    summary,
    risk_score,
    overall_risk_score,
    clauses = [],
    analysis_mode,
  } = data;

  const riskLabel =
    risk_score ||
    (overall_risk_score >= 60 ? 'HIGH' : overall_risk_score >= 30 ? 'MEDIUM' : 'LOW');
  const riskStyle = RISK_STYLES[riskLabel] || RISK_STYLES.LOW;

  const summaryFacts = summary?.key_facts || {};
  const contractSummary = {
    plain_summary: summary?.plain_summary || executive_summary || '',
    key_facts: { ...EMPTY_FACTS, ...summaryFacts },
    critical_clauses: Array.isArray(summary?.critical_clauses)
      ? summary.critical_clauses.map(normalizeClause)
      : [],
    verdict: summary?.verdict || '',
  };

  const highClauses = clauses.filter((clause) => clause.risk_level === 'HIGH');
  const mediumClauses = clauses.filter((clause) => clause.risk_level === 'MEDIUM');
  const standardClauses = clauses.filter((clause) => clause.risk_level === 'LOW');
  const fallbackImportantClauses = [...highClauses, ...mediumClauses].map(normalizeClause);
  const criticalAndMedium = (
    contractSummary.critical_clauses.length > 0
      ? contractSummary.critical_clauses
      : fallbackImportantClauses
  )
    .filter((clause) => ['HIGH', 'MEDIUM'].includes(clause.risk_level))
    .slice(0, 5);
  const uniqueStandardCategories = Array.from(
    new Set(standardClauses.map((clause) => clause.category)),
  );

  const factItems = [
    { label: 'Contract Type', value: contractSummary.key_facts.contract_type },
    { label: 'Payment', value: contractSummary.key_facts.payment },
    { label: 'Duration', value: contractSummary.key_facts.duration },
    { label: 'Termination', value: contractSummary.key_facts.termination },
    { label: 'Disputes', value: contractSummary.key_facts.dispute_resolution },
  ];

  const verdict =
    contractSummary.verdict ||
    (criticalAndMedium.length > 0
      ? `This contract contains ${criticalAndMedium.length} clause${
          criticalAndMedium.length !== 1 ? 's' : ''
        } that should be reviewed before signing.`
      : `This appears to be a standard contract with all ${clauses.length} clauses falling within normal risk parameters.`);

  const buildPlainText = () => {
    let text = `CONTRACT SUMMARY - ${title || 'Uploaded Contract'}\n`;
    text += `Risk: ${riskLabel}\n\n`;
    if (contractSummary.plain_summary) text += `${contractSummary.plain_summary}\n\n`;
    text += 'KEY FACTS:\n';
    factItems.forEach((fact) => {
      text += `- ${fact.label}: ${fact.value}\n`;
    });
    text += '\n';
    if (criticalAndMedium.length > 0) {
      text += `CRITICAL/MEDIUM CLAUSES (${criticalAndMedium.length}):\n`;
      criticalAndMedium.forEach((clause) => {
        text += `- ${clause.name} [${clause.risk_level}] - ${clause.plain_explanation}\n`;
      });
      text += '\n';
    }
    text += `VERDICT:\n${verdict}`;
    return text;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainText());
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      alert('Failed to copy to clipboard.');
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = (needed = 40) => {
      if (y + needed > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    const addWrapped = (text, fontSize = 11, lineGap = 15) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text || '', contentWidth);
      lines.forEach((line) => {
        ensureSpace(lineGap);
        doc.text(line, margin, y);
        y += lineGap;
      });
    };

    doc.setFillColor(28, 52, 146);
    doc.rect(0, 0, pageWidth, 90, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('ContractIntel', margin, 48);
    doc.setFontSize(11);
    doc.text('AI-Powered Contract Analysis Report', margin, 68);
    doc.setTextColor(0, 0, 0);
    y = 120;

    doc.setFontSize(14);
    doc.text(`Document: ${title || 'Uploaded Contract'}`, margin, y);
    y += 18;
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
    doc.text(`Risk Level: ${riskLabel}`, margin + 250, y);
    doc.setTextColor(0);
    y += 30;

    if (contractSummary.plain_summary) {
      doc.setFontSize(13);
      doc.text('What This Contract Says', margin, y);
      y += 18;
      addWrapped(contractSummary.plain_summary, 10.5, 14);
      y += 10;
    }

    ensureSpace(30);
    doc.setFontSize(13);
    doc.text('Key Facts', margin, y);
    y += 18;
    factItems.forEach((fact) => {
      addWrapped(`${fact.label}: ${fact.value}`, 10, 13);
    });
    y += 8;

    if (criticalAndMedium.length > 0) {
      ensureSpace(30);
      doc.setFontSize(13);
      doc.text(`Critical Clauses (${criticalAndMedium.length})`, margin, y);
      y += 18;
      criticalAndMedium.forEach((clause, index) => {
        ensureSpace(50);
        doc.setFontSize(11);
        doc.text(`${index + 1}. ${clause.name} [${clause.risk_level}]`, margin, y);
        y += 14;
        addWrapped(clause.plain_explanation, 10, 13);
        y += 6;
      });
    }

    ensureSpace(30);
    doc.setFontSize(13);
    doc.text('Plain-English Verdict', margin, y);
    y += 18;
    addWrapped(verdict, 10, 13);

    doc.save(`ContractIntel_Report_${(title || 'contract').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Contract Summary
            </p>
            <p className="text-sm font-semibold text-gray-900 truncate">
              {title || 'Uploaded Contract'}
            </p>
          </div>
        </div>
        <div
          className={`flex items-center px-3 py-1.5 rounded-full border text-xs font-bold flex-shrink-0 ${riskStyle.badge}`}
        >
          {riskStyle.label}
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {contractSummary.plain_summary && (
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              What This Contract Says
            </h2>
            <p className="max-w-5xl text-gray-800 text-base sm:text-[17px] leading-8 font-normal">
              {contractSummary.plain_summary}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {factItems.map((fact) => (
            <div
              key={fact.label}
              className="bg-gray-50 rounded-lg p-3 border border-gray-100 min-w-0"
            >
              <span className="text-xs text-gray-500">{fact.label}</span>
              <p className="text-sm font-medium text-gray-800 mt-1 break-words">
                {fact.value}
              </p>
            </div>
          ))}
        </div>

        {criticalAndMedium.length > 0 ? (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Critical Clauses to Review ({criticalAndMedium.length} shown)
            </h4>
            <div className="space-y-3">
              {criticalAndMedium.map((clause, index) => (
                <div
                  key={`${clause.name}-${index}`}
                  className={`border rounded-xl p-4 ${
                    clause.risk_level === 'HIGH'
                      ? 'border-red-200 bg-red-50/30'
                      : 'border-yellow-200 bg-yellow-50/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-xs font-bold text-gray-800 break-words">
                      {clause.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                        clause.risk_level === 'HIGH'
                          ? 'bg-red-100 text-red-700 border-red-200'
                          : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                      }`}
                    >
                      {clause.risk_level}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {clause.plain_explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">
                No High-Risk Clauses Found
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                All {clauses.length} clauses are within standard risk parameters.
              </p>
            </div>
          </div>
        )}

        {standardClauses.length > 0 && (
          <div>
            <button
              onClick={() => setStandardExpanded(!standardExpanded)}
              className="flex items-center gap-2 text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors"
            >
              <CheckCircle className="w-4 h-4 text-green-500" />
              Standard Clauses ({standardClauses.length} present)
              {standardExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {!standardExpanded && (
              <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                {uniqueStandardCategories.slice(0, 5).join(' / ')}
                {uniqueStandardCategories.length > 5 &&
                  ` + ${uniqueStandardCategories.length - 5} more`}
              </p>
            )}

            {standardExpanded && (
              <div className="mt-3 flex flex-wrap gap-2">
                {uniqueStandardCategories.map((category) => (
                  <span
                    key={category}
                    className="inline-flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5 text-xs font-medium text-gray-600"
                  >
                    {category}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
            Plain-English Verdict
          </h4>
          <p className="text-sm text-gray-700 leading-relaxed italic">{verdict}</p>
        </div>

        {analysis_mode && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-gray-400" />
              <span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                  analysis_mode === 'AI'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {analysis_mode === 'AI'
                  ? 'AI Analysis Mode'
                  : 'Local Analysis Mode (AI unavailable)'}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 leading-normal max-w-md">
              {analysis_mode === 'AI'
                ? 'Gemini analyzed your contract clauses for precision risk scoring and plain-English summaries.'
                : 'Processed locally using rule-based classifiers and heuristics because the Gemini API is currently unavailable.'}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
        <button
          onClick={handleDownloadPDF}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-sm hover:shadow-md transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          Download Report PDF
        </button>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-full text-xs font-semibold hover:bg-gray-50 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          {copySuccess ? 'Copied!' : 'Copy Summary'}
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-full text-xs font-semibold hover:bg-gray-50 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          New Upload
        </button>
      </div>
    </div>
  );
}
