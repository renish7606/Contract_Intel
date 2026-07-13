import React, { useState } from 'react';
import { Shield, ChevronDown, ChevronUp, User, Mail, Phone, Building, MapPin, CreditCard, Fingerprint, Globe, Landmark, Hash, MapPinned } from 'lucide-react';

const TYPE_ICONS = {
  PERSON: User,
  EMAIL: Mail,
  PHONE: Phone,
  ORG: Building,
  LOCATION: MapPin,
  AADHAAR: Fingerprint,
  PAN: CreditCard,
  PASSPORT: Globe,
  GSTIN: Hash,
  BANK_ACCOUNT: Landmark,
  IFSC: Landmark,
  PIN_CODE: MapPinned,
};

const TYPE_LABELS = {
  PERSON: 'Person Name',
  EMAIL: 'Email Address',
  PHONE: 'Phone Number',
  ORG: 'Organization',
  LOCATION: 'Location/Address',
  AADHAAR: 'Aadhaar Number',
  PAN: 'PAN Card',
  PASSPORT: 'Passport Number',
  GSTIN: 'GSTIN',
  BANK_ACCOUNT: 'Bank Account',
  IFSC: 'IFSC Code',
  PIN_CODE: 'Pin Code',
};

// Map placeholder tokens to their display colors
const TOKEN_STYLES = {
  '[EMAIL]': 'bg-purple-100 text-purple-700 border-purple-200',
  '[PHONE_NUMBER]': 'bg-blue-100 text-blue-700 border-blue-200',
  '[PARTY_NAME]': 'bg-orange-100 text-orange-700 border-orange-200',
  '[COMPANY/ORGANIZATION]': 'bg-teal-100 text-teal-700 border-teal-200',
  '[LOCATION/ADDRESS]': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  '[AADHAAR_NUMBER]': 'bg-red-100 text-red-700 border-red-200',
  '[PAN_NUMBER]': 'bg-amber-100 text-amber-700 border-amber-200',
  '[PASSPORT_NUMBER]': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  '[GSTIN]': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  '[BANK_ACCOUNT]': 'bg-rose-100 text-rose-700 border-rose-200',
  '[IFSC_CODE]': 'bg-pink-100 text-pink-700 border-pink-200',
  '[PIN_CODE]': 'bg-lime-100 text-lime-700 border-lime-200',
};

/**
 * Highlights redaction placeholder tokens in the scrubbed text with
 * colored inline badges so users can clearly see what was removed.
 */
function HighlightedText({ text }) {
  if (!text) return null;

  const display = text.slice(0, 2000);
  const truncated = text.length > 2000;

  // Build a regex that matches any of the known placeholder tokens
  const tokenPattern = Object.keys(TOKEN_STYLES)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const regex = new RegExp(`(${tokenPattern})`, 'g');

  const parts = display.split(regex);

  return (
    <p className="text-xs font-mono text-gray-500 leading-relaxed whitespace-pre-wrap">
      {parts.map((part, idx) => {
        const style = TOKEN_STYLES[part];
        if (style) {
          return (
            <span
              key={idx}
              className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold border mx-0.5 ${style}`}
            >
              {part}
            </span>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
      {truncated && '...'}
    </p>
  );
}

export default function RedactionPanel({ redactionSummary, scrubbedText }) {
  const [showPreview, setShowPreview] = useState(false);

  if (!redactionSummary) return null;

  const { total_removed = 0, by_type = {} } = redactionSummary;
  const hasRedactions = total_removed > 0;

  return (
    <div className={`rounded-2xl border p-5 transition-all duration-300 ${
      hasRedactions
        ? 'bg-green-50/50 border-green-200'
        : 'bg-gray-50 border-gray-100'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg ${hasRedactions ? 'bg-green-100' : 'bg-gray-100'}`}>
          <Shield className={`w-4 h-4 ${hasRedactions ? 'text-green-600' : 'text-gray-400'}`} />
        </div>
        <h3 className="text-sm font-bold text-gray-900">
          🔒 Privacy Shield Applied
        </h3>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-600 mb-4 leading-relaxed">
        {hasRedactions
          ? `We removed ${total_removed} piece${total_removed !== 1 ? 's' : ''} of personal data before sending your contract for analysis.`
          : 'No personal data was detected in this document. It was analysed as-is.'}
      </p>

      {/* PII Type Breakdown */}
      {hasRedactions && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(by_type).map(([type, count]) => {
            const Icon = TYPE_ICONS[type] || Shield;
            const label = TYPE_LABELS[type] || type;
            return (
              <div
                key={type}
                className="inline-flex items-center gap-1.5 bg-white border border-green-100 rounded-full px-3 py-1.5 text-xs font-medium text-gray-700"
              >
                <Icon className="w-3 h-3 text-green-500" />
                {count} × {label}
              </div>
            );
          })}
        </div>
      )}

      {/* Redacted Preview Toggle */}
      {scrubbedText && (
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
        >
          {showPreview ? (
            <>Hide Redacted Preview <ChevronUp className="w-3.5 h-3.5" /></>
          ) : (
            <>View Redacted Preview <ChevronDown className="w-3.5 h-3.5" /></>
          )}
        </button>
      )}

      {showPreview && scrubbedText && (
        <div className="mt-3 bg-white border border-gray-100 rounded-xl p-4 max-h-60 overflow-y-auto">
          <HighlightedText text={scrubbedText} />
        </div>
      )}
    </div>
  );
}
