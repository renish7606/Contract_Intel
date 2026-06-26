import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Download, Copy, Upload, FileText, Shield } from 'lucide-react';
import { jsPDF } from 'jspdf';

const RISK_STYLES = {
  HIGH: {
    badge: 'bg-red-100 text-red-700 border-red-200',
    icon: '⚠️',
    label: 'HIGH RISK',
  },
  MEDIUM: {
    badge: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    icon: '⚡',
    label: 'MEDIUM RISK',
  },
  LOW: {
    badge: 'bg-green-100 text-green-700 border-green-200',
    icon: '✅',
    label: 'LOW RISK',
  },
};

export default function SummaryCard({ data }) {
  const navigate = useNavigate();
  const [standardExpanded, setStandardExpanded] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  if (!data) return null;

  const {
    title,
    executive_summary,
    risk_score,
    overall_risk_score,
    clauses = [],
    analysis_mode,
  } = data;

  // Derive risk label from risk_score or from overall_risk_score
  const riskLabel = risk_score || (overall_risk_score >= 60 ? 'HIGH' : overall_risk_score >= 30 ? 'MEDIUM' : 'LOW');
  const riskStyle = RISK_STYLES[riskLabel] || RISK_STYLES.LOW;

  // Separate critical vs standard clauses
  const criticalClauses = clauses.filter((c) => c.risk_level === 'HIGH');
  const mediumClauses = clauses.filter((c) => c.risk_level === 'MEDIUM');
  const standardClauses = clauses.filter((c) => c.risk_level === 'LOW');
  const criticalAndMedium = [...criticalClauses, ...mediumClauses];

  // Build a plain-text summary for clipboard
  const buildPlainText = () => {
    let text = `CONTRACT SUMMARY — ${title || 'Uploaded Contract'}\n`;
    text += `Risk: ${riskLabel}\n\n`;
    if (executive_summary) text += `${executive_summary}\n\n`;
    if (criticalAndMedium.length > 0) {
      text += `CRITICAL/MEDIUM CLAUSES (${criticalAndMedium.length}):\n`;
      criticalAndMedium.forEach((c) => {
        text += `• ${c.category} [${c.risk_level}] — ${c.simplified_text}\n`;
      });
      text += '\n';
    }
    if (standardClauses.length > 0) {
      text += `STANDARD CLAUSES (${standardClauses.length}):\n`;
      text += standardClauses.map((c) => c.category).join(' · ');
    }
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

    // Branded cover header
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

    // Executive Summary
    if (executive_summary) {
      doc.setFontSize(13);
      doc.text('Executive Summary', margin, y);
      y += 18;
      addWrapped(executive_summary, 10.5, 14);
      y += 10;
    }

    // Critical Clauses
    if (criticalAndMedium.length > 0) {
      ensureSpace(30);
      doc.setFontSize(13);
      doc.text(`Critical & Medium Risk Clauses (${criticalAndMedium.length})`, margin, y);
      y += 18;
      criticalAndMedium.forEach((clause, i) => {
        ensureSpace(50);
        doc.setFontSize(11);
        doc.text(`${i + 1}. ${clause.category} [${clause.risk_level}]`, margin, y);
        y += 14;
        addWrapped(clause.simplified_text, 10, 13);
        y += 6;
      });
    }

    // Standard Clauses
    if (standardClauses.length > 0) {
      ensureSpace(30);
      doc.setFontSize(13);
      doc.text(`Standard Clauses (${standardClauses.length})`, margin, y);
      y += 18;
      addWrapped(standardClauses.map((c) => c.category).join(' · '), 10, 13);
    }

    doc.save(`ContractIntel_Report_${(title || 'contract').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* ── Card Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contract Summary</p>
            <p className="text-sm font-semibold text-gray-900 truncate">
              {title || 'Uploaded Contract'}
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold flex-shrink-0 ${riskStyle.badge}`}>
          <span>{riskStyle.icon}</span>
          {riskStyle.label}
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* ── What This Contract Is ──────────────────────────── */}
        {executive_summary && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
              📋 What This Contract Is
            </h4>
            <div className="text-sm text-gray-600 leading-relaxed space-y-1">
              {executive_summary.split('\n').filter(Boolean).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {/* ── Critical Clauses ───────────────────────────────── */}
        {criticalAndMedium.length > 0 ? (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Critical Clauses to Review ({criticalAndMedium.length} found)
            </h4>
            <div className="space-y-3">
              {criticalAndMedium.map((clause, i) => (
                <div
                  key={clause.id || i}
                  className={`border rounded-xl p-4 ${
                    clause.risk_level === 'HIGH'
                      ? 'border-red-200 bg-red-50/30'
                      : 'border-yellow-200 bg-yellow-50/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-800">
                      {clause.category}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      clause.risk_level === 'HIGH'
                        ? 'bg-red-100 text-red-700 border-red-200'
                        : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                    }`}>
                      {clause.risk_level}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {clause.simplified_text}
                  </p>
                  {clause.risk_explanation && (
                    <p className="mt-2 text-[11px] text-gray-400 italic">
                      {clause.risk_explanation}
                    </p>
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

        {/* ── Standard Clauses (collapsed) ───────────────────── */}
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
                {standardClauses.slice(0, 5).map((c) => c.category).join(' · ')}
                {standardClauses.length > 5 && ` + ${standardClauses.length - 5} more`}
              </p>
            )}

            {standardExpanded && (
              <div className="mt-3 flex flex-wrap gap-2">
                {standardClauses.map((clause, i) => (
                  <span
                    key={clause.id || i}
                    className="inline-flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5 text-xs font-medium text-gray-600"
                  >
                    {clause.category}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Plain-English Verdict ──────────────────────────── */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
            💡 Plain-English Verdict
          </h4>
          <p className="text-sm text-gray-700 leading-relaxed italic">
            {criticalAndMedium.length > 0
              ? `This contract contains ${criticalAndMedium.length} clause${criticalAndMedium.length !== 1 ? 's' : ''} that warrant${criticalAndMedium.length === 1 ? 's' : ''} careful review before signing. ${
                  criticalClauses.length > 0
                    ? `The ${criticalClauses[0]?.category || 'flagged'} clause is particularly noteworthy.`
                    : 'No critical-risk clauses were found, but medium-risk items should still be reviewed.'
                }`
              : `This appears to be a standard contract with all ${clauses.length} clauses falling within normal risk parameters. No items require immediate legal attention.`}
          </p>
        </div>

        {/* ── Analysis Mode Badge ────────────────────────────── */}
        {analysis_mode && (
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-gray-400" />
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
              analysis_mode === 'AI'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {analysis_mode === 'AI' ? 'AI Analysis Mode' : 'Local Analysis Mode (AI unavailable)'}
            </span>
          </div>
        )}
      </div>

      {/* ── Action Buttons ────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
        <button
          onClick={handleDownloadPDF}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-sm hover:shadow-md transition-all"
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
