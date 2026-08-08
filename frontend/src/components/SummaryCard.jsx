import { useState } from 'react';
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
  const riskLevel = (clause.risk_level || 'MEDIUM').toUpperCase();
  const fallbackScore = riskLevel === 'HIGH' ? 75 : riskLevel === 'MEDIUM' ? 50 : 15;
  return {
    name: clause.name || clause.category || 'Important Clause',
    plain_explanation:
      clause.plain_explanation ||
      clause.simplified_text ||
      'This means you should review this clause before signing.',
    risk_level: riskLevel,
    risk_score: Math.max(0, Math.min(100, Number(clause.risk_score) || fallbackScore)),
    detected_text: clause.detected_text || '',
    why_risky: clause.why_risky || clause.risk_explanation || '',
    who_benefits: clause.who_benefits || '',
    potential_impact: clause.potential_impact || '',
    confidence: clause.confidence || '',
    suggested_action: clause.suggested_action || '',
    suggested_clause_text: clause.suggested_clause_text || '',
    suggestion_reasoning: clause.suggestion_reasoning || '',
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
    (overall_risk_score >= 65 ? 'HIGH' : overall_risk_score >= 35 ? 'MEDIUM' : 'LOW');
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
        if (clause.why_risky) text += `  Why risky: ${clause.why_risky}\n`;
        if (clause.who_benefits) text += `  Who benefits: ${clause.who_benefits}\n`;
        if (clause.potential_impact) text += `  Potential impact: ${clause.potential_impact}\n`;
        if (clause.suggested_action) text += `  Suggested action: ${clause.suggested_action}\n`;
        if (clause.suggested_clause_text) text += `  Alternative wording: ${clause.suggested_clause_text}\n`;
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

  const handleSuggestedClauseCopy = async (suggestedClause) => {
    try {
      await navigator.clipboard.writeText(suggestedClause);
    } catch {
      alert('Failed to copy the suggested clause.');
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 42;
    const contentWidth = pageWidth - margin * 2;
    const navy = [30, 58, 138];
    const muted = [100, 116, 139];
    const body = [31, 41, 55];
    const riskPalette = riskLabel === 'HIGH'
      ? { fill: [254, 226, 226], text: [185, 28, 28] }
      : riskLabel === 'MEDIUM'
        ? { fill: [254, 243, 199], text: [161, 98, 7] }
        : { fill: [220, 252, 231], text: [21, 128, 61] };
    let y = 0;

    const startPage = (isFirstPage = false) => {
      doc.setFillColor(...navy);
      doc.rect(0, 0, pageWidth, isFirstPage ? 78 : 44, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isFirstPage ? 19 : 12);
      doc.text(isFirstPage ? 'ContractIntel' : 'ContractIntel  |  Contract Analysis Report', margin, isFirstPage ? 37 : 28);
      if (isFirstPage) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.text('Plain-English contract review and negotiation guide', margin, 56);
      }
      doc.setTextColor(...body);
      y = isFirstPage ? 108 : 70;
    };

    const ensureSpace = (needed = 40) => {
      if (y + needed > pageHeight - margin) {
        doc.addPage();
        startPage();
      }
    };

    const addWrapped = (text, x, width, fontSize = 10, lineGap = 14, color = body) => {
      doc.setTextColor(...color);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text || 'Not specified', width);
      lines.forEach((line) => {
        ensureSpace(lineGap);
        doc.text(line, x, y);
        y += lineGap;
      });
    };

    const sectionTitle = (label) => {
      ensureSpace(32);
      doc.setFillColor(239, 246, 255);
      doc.roundedRect(margin, y - 16, contentWidth, 26, 5, 5, 'F');
      doc.setTextColor(...navy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(label.toUpperCase(), margin + 12, y + 1);
      y += 25;
    };

    startPage(true);
    doc.setTextColor(...body);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(title || 'Uploaded Contract', margin, y);
    y += 17;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text(`Generated ${new Date().toLocaleString()}`, margin, y);
    doc.setFillColor(...riskPalette.fill);
    doc.roundedRect(pageWidth - margin - 120, y - 12, 120, 20, 10, 10, 'F');
    doc.setTextColor(...riskPalette.text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`${riskLabel} RISK  ${overall_risk_score || 0}/100`, pageWidth - margin - 108, y + 1);
    y += 27;

    if (contractSummary.plain_summary) {
      sectionTitle('What this contract says');
      addWrapped(contractSummary.plain_summary, margin + 4, contentWidth - 8, 10.5, 15);
      y += 8;
    }

    sectionTitle('Key facts');
    for (let index = 0; index < factItems.length; index += 2) {
      const row = factItems.slice(index, index + 2);
      const cardWidth = (contentWidth - 10) / 2;
      const values = row.map((fact) => doc.splitTextToSize(fact.value || 'Not specified', cardWidth - 20));
      const cardHeight = Math.max(...values.map((lines) => 30 + lines.length * 12), 52);
      ensureSpace(cardHeight + 8);
      row.forEach((fact, itemIndex) => {
        const x = margin + itemIndex * (cardWidth + 10);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, y - 12, cardWidth, cardHeight, 6, 6, 'F');
        doc.setTextColor(...muted);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(fact.label.toUpperCase(), x + 10, y + 2);
        doc.setTextColor(...body);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        values[itemIndex].forEach((line, lineIndex) => doc.text(line, x + 10, y + 19 + lineIndex * 12));
      });
      y += cardHeight + 8;
    }

    if (criticalAndMedium.length > 0) {
      sectionTitle(`Critical clauses to review (${criticalAndMedium.length})`);
      criticalAndMedium.forEach((clause, index) => {
        const clausePalette = clause.risk_level === 'HIGH'
          ? { fill: [254, 226, 226], text: [185, 28, 28] }
          : { fill: [254, 243, 199], text: [161, 98, 7] };
        const fields = [
          ['What it means', clause.plain_explanation],
          ['Why it matters', clause.why_risky],
          ['Who benefits', clause.who_benefits],
          ['Potential impact', clause.potential_impact],
          ['Suggested action', clause.suggested_action],
          ['Suggested wording', clause.suggested_clause_text],
          ['Why this helps', clause.suggestion_reasoning],
        ].filter(([, value]) => value);
        const fieldHeight = fields.reduce((total, [, value]) => total + 14 + doc.splitTextToSize(value, contentWidth - 36).length * 12, 0);
        const cardHeight = 48 + fieldHeight + 12;
        ensureSpace(Math.min(cardHeight + 10, pageHeight - 120));
        const cardY = y - 12;
        doc.setFillColor(255, 251, 235);
        doc.roundedRect(margin, cardY, contentWidth, cardHeight, 7, 7, 'F');
        doc.setFillColor(...clausePalette.fill);
        doc.roundedRect(margin, cardY, 5, cardHeight, 3, 3, 'F');
        doc.setFontSize(11);
        doc.setTextColor(...body);
        doc.setFont('helvetica', 'bold');
        doc.text(`${index + 1}. ${clause.name}`, margin + 15, y + 2);
        doc.setTextColor(...clausePalette.text);
        doc.setFontSize(8.5);
        doc.text(`${clause.risk_level}  |  ${clause.risk_score}/100  |  ${clause.confidence || 'MEDIUM'} CONFIDENCE`, margin + 15, y + 17);
        y += 34;
        fields.forEach(([label, value]) => {
          doc.setTextColor(...navy);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text(label.toUpperCase(), margin + 15, y);
          y += 12;
          addWrapped(value, margin + 15, contentWidth - 30, 9.5, 12, body);
          y += 2;
        });
        y = cardY + cardHeight + 12;
      });
    }

    sectionTitle('Plain-English verdict');
    addWrapped(verdict, margin + 4, contentWidth - 8, 10.5, 15);

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28);
      doc.setTextColor(...muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('AI-generated for informational purposes — not legal advice.', margin, pageHeight - 16);
      doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin - 46, pageHeight - 16);
    }

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
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              What This Contract Says
            </h2>
            <p className="max-w-5xl text-sm text-gray-700 leading-7 font-normal">
              {contractSummary.plain_summary}
            </p>
          </div>
        )}

        <p className="text-xs text-gray-400 -mt-3">
          ⚠️ Risk scores and negotiation suggestions are AI-generated for informational purposes and are not a substitute for advice from a qualified legal professional.
        </p>

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
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm mb-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Risk Breakdown
              </h3>
              {criticalAndMedium.map((clause, index) => (
                <div key={`${clause.name}-risk-${index}`} className="flex items-center gap-3 mb-3 last:mb-0">
                  <span className="text-sm text-gray-700 w-40 truncate">{clause.name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        clause.risk_score >= 65 ? 'bg-red-500' :
                        clause.risk_score >= 35 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${clause.risk_score}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600 w-12 text-right">
                    {clause.risk_score}/100
                  </span>
                </div>
              ))}
            </div>
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
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-xs text-gray-600">
                    {clause.why_risky && <p><span className="font-semibold text-gray-700">Why it&apos;s risky: </span>{clause.why_risky}</p>}
                    {clause.who_benefits && <p><span className="font-semibold text-gray-700">Who benefits: </span>{clause.who_benefits}</p>}
                    {clause.potential_impact && <p><span className="font-semibold text-gray-700">Potential impact: </span>{clause.potential_impact}</p>}
                  </div>
                  {clause.suggested_action && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
                        💡 Suggested Action
                      </p>
                      <p className="text-sm text-gray-700">{clause.suggested_action}</p>
                      {clause.suggested_clause_text && (
                        <div className="mt-2 bg-blue-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">Suggested Alternative Wording</p>
                          <p className="text-sm text-gray-800 italic">&ldquo;{clause.suggested_clause_text}&rdquo;</p>
                          <button
                            onClick={() => handleSuggestedClauseCopy(clause.suggested_clause_text)}
                            className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Copy Suggested Clause
                          </button>
                        </div>
                      )}
                      {clause.suggestion_reasoning && (
                        <p className="mt-2 text-xs text-gray-500"><span className="font-semibold">Why this helps: </span>{clause.suggestion_reasoning}</p>
                      )}
                    </div>
                  )}
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
