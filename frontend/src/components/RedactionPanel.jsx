import React, { useState } from 'react';
import { Shield, ChevronDown, ChevronUp, User, Mail, Phone, Building, MapPin } from 'lucide-react';

const TYPE_ICONS = {
  PERSON: User,
  EMAIL: Mail,
  PHONE: Phone,
  ORG: Building,
  LOCATION: MapPin,
};

const TYPE_LABELS = {
  PERSON: 'Person Name',
  EMAIL: 'Email Address',
  PHONE: 'Phone Number',
  ORG: 'Organization',
  LOCATION: 'Location/Address',
};

export default function RedactionPanel({ redactionSummary, scrubbedText }) {
  const [showPreview, setShowPreview] = useState(false);

  if (!redactionSummary) return null;

  const { total_removed = 0, by_type = {} } = redactionSummary;
  const hasRedactions = total_removed > 0;

  return (
    <div className={`rounded-2xl border p-5 transition-all duration-300 ${
      hasRedactions
        ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
        : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg ${hasRedactions ? 'bg-green-100 dark:bg-green-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
          <Shield className={`w-4 h-4 ${hasRedactions ? 'text-green-600' : 'text-gray-400'}`} />
        </div>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
          🔒 Privacy Shield Applied
        </h3>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
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
                className="inline-flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-green-100 dark:border-green-800 rounded-full px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300"
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
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {showPreview ? (
            <>Hide Redacted Preview <ChevronUp className="w-3.5 h-3.5" /></>
          ) : (
            <>View Redacted Preview <ChevronDown className="w-3.5 h-3.5" /></>
          )}
        </button>
      )}

      {showPreview && scrubbedText && (
        <div className="mt-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 max-h-60 overflow-y-auto">
          <p className="text-xs font-mono text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
            {scrubbedText.slice(0, 2000)}
            {scrubbedText.length > 2000 && '...'}
          </p>
        </div>
      )}
    </div>
  );
}
