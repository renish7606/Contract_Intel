import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Upload, EyeOff, Brain, FileCheck, Lock, Zap, ShieldCheck, ArrowRight, ExternalLink, Globe, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.5, ease: 'easeOut' },
  }),
};

const steps = [
  { icon: Upload, title: 'Upload your PDF or DOCX', desc: 'Drag and drop or browse — we support all standard contract formats.' },
  { icon: EyeOff, title: 'PII is automatically redacted', desc: 'Names, emails, phone numbers, and addresses are scrubbed before any AI processing.' },
  { icon: Brain, title: '41+ clauses detected & classified', desc: 'Our CUAD-trained ML model identifies and categorises every clause in seconds.' },
  { icon: FileCheck, title: 'Plain-English summary & risk score', desc: 'You get a scannable summary card with critical clauses highlighted and a clear verdict.' },
];

const features = [
  { icon: Brain, title: '41+ Clause Categories', desc: 'Trained on the CUAD legal dataset — the most comprehensive contract analysis coverage available.' },
  { icon: Zap, title: 'Risk Score in Seconds', desc: 'Instant risk assessment powered by hybrid AI + ML pipeline. No waiting, no legal jargon.' },
  { icon: ShieldCheck, title: 'Zero PII to External APIs', desc: 'All personal data is redacted before it reaches our AI. Your privacy is architecturally guaranteed.' },
];

const privacyBullets = [
  'PII is scrubbed on our server before reaching any AI model',
  'Raw contract text is never stored permanently',
  'Gemini API only receives anonymised clause text',
  'No data is sold or shared with third parties',
];

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Redirect authenticated users to dashboard
  React.useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleCTA = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">

      {/* ════════════════════════════════════════════════════════════
          SECTION 1 — HERO
          ════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden pt-20 pb-28 sm:pt-28 sm:pb-36">
        {/* Background decorations */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 blur-3xl opacity-60" />
          <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 blur-3xl opacity-40" />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={0}
            className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 px-4 py-1.5 rounded-full text-xs font-semibold text-blue-700 dark:text-blue-300 mb-6"
          >
            <Lock className="w-3.5 h-3.5" />
            Privacy-First AI Contract Analysis
          </motion.div>

          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={1}
            className="text-4xl sm:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-[1.1] mb-6"
          >
            Understand Any Contract{' '}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              in 30 Seconds
            </span>
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={2}
            className="text-lg sm:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            AI-powered clause detection and risk summary — your data never leaves your control.
          </motion.p>

          <motion.button
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={3}
            onClick={handleCTA}
            className="group inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-4 rounded-full text-base font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all duration-300 hover:-translate-y-0.5"
          >
            Analyse Your Contract — Free
            <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </motion.button>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SECTION 2 — HOW IT WORKS
          ════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-white dark:bg-gray-900/50">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              How It Works
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              From upload to insight in four simple steps. No legal expertise required.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                variants={fadeUp}
                custom={i}
                className="relative group"
              >
                {/* Connector line (hidden on first item and mobile) */}
                {i > 0 && (
                  <div className="hidden lg:block absolute -left-3 top-10 w-6 h-0.5 bg-gradient-to-r from-blue-200 to-blue-300 dark:from-blue-800 dark:to-blue-700" />
                )}

                <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 h-full hover:border-blue-200 dark:hover:border-blue-700 hover:shadow-lg transition-all duration-300 group-hover:-translate-y-1">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
                      <step.icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">
                      Step {i + 1}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SECTION 3 — PRIVACY
          ════════════════════════════════════════════════════════════ */}
      <section id="privacy" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: copy */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeUp}
            >
              <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-full text-xs font-semibold mb-4 border border-green-100 dark:border-green-800">
                <ShieldCheck className="w-3.5 h-3.5" />
                Your Privacy, Guaranteed
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-6">
                Your data stays yours.{' '}
                <span className="text-green-600">Always.</span>
              </h2>
              <ul className="space-y-4">
                {privacyBullets.map((bullet, i) => (
                  <motion.li
                    key={i}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={fadeUp}
                    custom={i}
                    className="flex items-start gap-3"
                  >
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="w-3 h-3 text-green-600" />
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{bullet}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            {/* Right: privacy flow diagram */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeUp}
              custom={2}
              className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-8"
            >
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-6">Privacy Pipeline</p>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Contract Upload', icon: '📄', color: 'bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800 text-blue-700 dark:text-blue-300' },
                  { label: 'PII Scrubbing', icon: '🔒', color: 'bg-red-50 dark:bg-red-900/30 border-red-100 dark:border-red-800 text-red-700 dark:text-red-300', highlight: true },
                  { label: 'Anonymised Clause Analysis', icon: '🧠', color: 'bg-purple-50 dark:bg-purple-900/30 border-purple-100 dark:border-purple-800 text-purple-700 dark:text-purple-300' },
                  { label: 'Summary & Risk Report', icon: '✅', color: 'bg-green-50 dark:bg-green-900/30 border-green-100 dark:border-green-800 text-green-700 dark:text-green-300' },
                ].map((step, i) => (
                  <React.Fragment key={step.label}>
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${step.color} ${step.highlight ? 'ring-2 ring-red-200 dark:ring-red-800' : ''}`}>
                      <span className="text-lg">{step.icon}</span>
                      <span className="text-sm font-semibold">{step.label}</span>
                      {step.highlight && (
                        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-red-500">No PII After This</span>
                      )}
                    </div>
                    {i < 3 && (
                      <div className="flex justify-center">
                        <div className="w-0.5 h-4 bg-gray-200 dark:bg-gray-700 rounded-full" />
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SECTION 4 — FEATURE HIGHLIGHTS
          ════════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 bg-white dark:bg-gray-900/50">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Built for Non-Lawyers
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              No legal expertise needed. Upload, read, decide.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                variants={fadeUp}
                custom={i}
                className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-8 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-300 hover:-translate-y-1"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white mb-5 shadow-sm">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SECTION 5 — FOOTER
          ════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-gray-100 dark:border-gray-800 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              Contract<span className="text-blue-600">Intel</span>
            </span>
            <span className="text-xs text-gray-400 ml-2">
              © {new Date().getFullYear()}. Zero logs. Complete PII compliance.
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/renish7606"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <Globe className="w-5 h-5" />
            </a>
            <a
              href="mailto:contact@contractintel.app"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <Mail className="w-5 h-5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
