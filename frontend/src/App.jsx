// import { useState } from 'react'
// import reactLogo from './assets/react.svg'
// import viteLogo from './assets/vite.svg'
// import heroImg from './assets/hero.png'
// import './App.css'

// function App() {
//   const [count, setCount] = useState(0)

//   return (
//     <>
//       <section id="center">
//         <div className="hero">
//           <img src={heroImg} className="base" width="170" height="179" alt="" />
//           <img src={reactLogo} className="framework" alt="React logo" />
//           <img src={viteLogo} className="vite" alt="Vite logo" />
//         </div>
//         <div>
//           <h1>Get started</h1>
//           <p>
//             Edit <code>src/App.jsx</code> and save to test <code>HMR</code>
//           </p>
//         </div>
//         <button
//           type="button"
//           className="counter"
//           onClick={() => setCount((count) => count + 1)}
//         >
//           Count is {count}
//         </button>
//       </section>

//       <div className="ticks"></div>

//       <section id="next-steps">
//         <div id="docs">
//           <svg className="icon" role="presentation" aria-hidden="true">
//             <use href="/icons.svg#documentation-icon"></use>
//           </svg>
//           <h2>Documentation</h2>
//           <p>Your questions, answered</p>
//           <ul>
//             <li>
//               <a href="https://vite.dev/" target="_blank">
//                 <img className="logo" src={viteLogo} alt="" />
//                 Explore Vite
//               </a>
//             </li>
//             <li>
//               <a href="https://react.dev/" target="_blank">
//                 <img className="button-icon" src={reactLogo} alt="" />
//                 Learn more
//               </a>
//             </li>
//           </ul>
//         </div>
//         <div id="social">
//           <svg className="icon" role="presentation" aria-hidden="true">
//             <use href="/icons.svg#social-icon"></use>
//           </svg>
//           <h2>Connect with us</h2>
//           <p>Join the Vite community</p>
//           <ul>
//             <li>
//               <a href="https://github.com/vitejs/vite" target="_blank">
//                 <svg
//                   className="button-icon"
//                   role="presentation"
//                   aria-hidden="true"
//                 >
//                   <use href="/icons.svg#github-icon"></use>
//                 </svg>
//                 GitHub
//               </a>
//             </li>
//             <li>
//               <a href="https://chat.vite.dev/" target="_blank">
//                 <svg
//                   className="button-icon"
//                   role="presentation"
//                   aria-hidden="true"
//                 >
//                   <use href="/icons.svg#discord-icon"></use>
//                 </svg>
//                 Discord
//               </a>
//             </li>
//             <li>
//               <a href="https://x.com/vite_js" target="_blank">
//                 <svg
//                   className="button-icon"
//                   role="presentation"
//                   aria-hidden="true"
//                 >
//                   <use href="/icons.svg#x-icon"></use>
//                 </svg>
//                 X.com
//               </a>
//             </li>
//             <li>
//               <a href="https://bsky.app/profile/vite.dev" target="_blank">
//                 <svg
//                   className="button-icon"
//                   role="presentation"
//                   aria-hidden="true"
//                 >
//                   <use href="/icons.svg#bluesky-icon"></use>
//                 </svg>
//                 Bluesky
//               </a>
//             </li>
//           </ul>
//         </div>
//       </section>

//       <div className="ticks"></div>
//       <section id="spacer"></section>
//     </>
//   )
// }

// export default App


import React, { useEffect, useState, useRef } from 'react';
import { Upload, Shield, Sparkles, FileText, CheckCircle, AlertTriangle, HelpCircle, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import api from './api.js';

// ClauseCard Component on the Right Panel
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
  const riskIcon = {
    HIGH: 'H',
    MEDIUM: 'M',
    LOW: 'L',
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
          <p className="mt-2 text-[11px] text-gray-500 font-mono bg-gray-50 p-3 rounded-xl border border-gray-100 leading-relaxed italic animate-in fade-in duration-150">
            "{clause.original_text}"
          </p>
        )}
      </div>

      <div className="border-t border-dashed border-gray-100 pt-2 flex items-center justify-between text-[10px] text-gray-400">
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold ${riskBadgeStyle[clause.risk_level] || riskBadgeStyle.LOW}`}>
          {riskIcon[clause.risk_level] || 'L'} {clause.risk_level || 'LOW'} RISK
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

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [processedDoc, setProcessedDoc] = useState(null);
  const [activeClauseId, setActiveClauseId] = useState(null);

  // 🔥 NEW REF: Stores references to all left side text paragraphs dynamically
  const paragraphRefs = useRef([]);

  useEffect(() => {
    /* global google */
    if (typeof google !== 'undefined') {
      google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
      });
    }
  }, []);

  // 🔥 NEW EFFECT: Auto-scrolls the left panel whenever activeClauseId changes
  useEffect(() => {
    if (activeClauseId !== null && paragraphRefs.current[activeClauseId]) {
      paragraphRefs.current[activeClauseId].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest', // Centers or brings it cleanly into view without moving the whole page layout
      });
    }
  }, [activeClauseId]);

  const handleGoogleResponse = async (authResult) => {
    try {
      const response = await api.post('/api/auth/google/', {
        access_token: authResult.credential,
      });
      localStorage.setItem('token', response.data.access);
      setUser(response.data.user);
    } catch (error) {
      console.error(error);
    }
  };

  const triggerGooglePopup = () => {
    if (typeof google !== 'undefined') {
      google.accounts.id.prompt();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setProcessedDoc(null);
    setActiveClauseId(null);
  };

  const handleFileUpload = async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    setLoading(true);
    setLoadingStep('Reading and scrubbing document...');
    setLoadingProgress(20);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      setLoadingStep('Running local ML classifier...');
      setLoadingProgress(45);
      await new Promise((r) => setTimeout(r, 400));

      setLoadingStep('Sending to AI for plain-English summaries & risk scoring...');
      setLoadingProgress(70);
      paragraphRefs.current = [];
      const response = await api.post('/api/contracts/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setLoadingStep('Rendering results...');
      setLoadingProgress(95);
      await new Promise((r) => setTimeout(r, 200));
      setProcessedDoc(response.data);
      
      if (response.data.clauses?.length > 0) {
        setActiveClauseId(0);
      }
    } catch (err) {
      alert('Upload failed. Check the console for details.');
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingStep('');
      setLoadingProgress(0);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col justify-between p-6 bg-gray-50/50 overflow-hidden font-sans">
      
      {/* Header Navigation */}
      <header className="max-w-7xl w-full mx-auto flex justify-between items-center bg-white border border-gray-100 px-6 py-4 rounded-2xl shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2 font-bold text-xl">
          <Shield className="w-6 h-6 text-blue-600" />
          <span>Contract<span className="text-blue-600 font-medium">Intel</span></span>
        </div>
        
        {user ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white px-3.5 py-1.5 rounded-full border border-gray-100 shadow-sm text-xs font-medium text-gray-600">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span>{user.email}</span>
            </div>
            <button onClick={handleLogout} className="text-xs font-semibold text-red-500 hover:text-red-600 bg-red-50/50 px-3.5 py-1.5 rounded-full border border-red-100/50">
              Sign Out
            </button>
          </div>
        ) : (
          <button onClick={triggerGooglePopup} className="bg-white border border-gray-200 text-gray-700 font-semibold px-4 py-2 rounded-full text-xs shadow-sm hover:bg-gray-50">
            Sign In with Google
          </button>
        )}
      </header>

      {/* Primary Workspace Box */}
      <main className="w-full max-w-7xl mx-auto flex-1 flex flex-col justify-center my-6 min-h-0">
        {!processedDoc ? (
          <div className="max-w-4xl w-full mx-auto flex flex-col items-center text-center space-y-8">
            <div className="bg-blue-50 text-blue-600 border border-blue-100/50 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI-Powered Contract Compliance</span>
            </div>

            <h1 className="text-5xl font-bold tracking-tight text-gray-900 leading-[1.15]">
              Simplify legal complexity. <br/>
              <span className="text-blue-600">Uncover hidden risks instantly.</span>
            </h1>

            <label className={`w-full max-w-xl border-2 border-dashed border-gray-200 bg-white rounded-3xl p-10 flex flex-col items-center justify-center shadow-sm transition-all ${user && !loading ? 'cursor-pointer hover:border-blue-400' : 'opacity-70'}`}>
              <input type="file" accept=".txt,.pdf,.docx" onChange={handleFileUpload} className="hidden" disabled={!user || loading} />
              {loading ? (
                <div className="flex flex-col items-center gap-4 w-full">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-semibold text-gray-700 text-center">{loadingStep}</p>
                  <div className="w-full max-w-xs bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${loadingProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-4 rounded-full bg-blue-50 text-blue-600 mb-4 animate-bounce">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700">
                    {user ? 'Click to select contract file' : 'Sign in to upload a contract'}
                  </span>
                  <span className="text-xs text-gray-400 mt-1">PDF, DOCX, or TXT</span>
                </>
              )}
            </label>
          </div>
        ) : (
          /* Split-Screen Workspace Grid */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full min-h-0 w-full items-stretch animate-in fade-in duration-200">
            
            {/* LEFT COLUMN: Clean Document View with Autoscroll References */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6 flex flex-col shadow-sm min-h-0">
              <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4 flex-shrink-0">
                <div className="flex items-center gap-2 text-green-600 font-semibold text-xs">
                  <CheckCircle className="w-4 h-4" />
                  <span>PII Compliance Secured</span>
                </div>
                <button onClick={() => setProcessedDoc(null)} className="text-xs text-blue-600 font-semibold hover:underline">
                  ← Upload another file
                </button>
              </div>
              
              <div className="flex items-center justify-between mb-3 bg-gray-50/50 p-3 rounded-xl border border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <h2 className="text-xs font-bold text-gray-700 truncate">{processedDoc.title}</h2>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {processedDoc.analysis_mode && (
                    <div className={`flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border ${
                      processedDoc.analysis_mode === 'AI'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {processedDoc.analysis_mode === 'AI'
                        ? 'AI Analysis Mode'
                        : 'Local Analysis Mode (AI unavailable)'}
                    </div>
                  )}
                  {processedDoc.overall_risk_score !== undefined && (
                    <div className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      processedDoc.overall_risk_score >= 60
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : processedDoc.overall_risk_score >= 30
                        ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                        : 'bg-green-50 text-green-700 border-green-200'
                    }`}>
                      Risk Score: {processedDoc.overall_risk_score}/100
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex-1 bg-gray-50/30 border border-gray-100 p-5 rounded-2xl overflow-y-auto space-y-4 shadow-inner min-h-0">
                {processedDoc.clauses?.map((clause, index) => {
                  const isHighlighted = activeClauseId === index;
                  return (
                    <p 
                      key={index}
                      // 🔥 FIX: Bind each DOM paragraph node to our tracking index reference list
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

            {/* RIGHT COLUMN: Scrolling Feed of Cards */}
            <div className="flex flex-col space-y-4 overflow-y-auto pr-1 h-full min-h-0">
              <div className="bg-white border border-gray-100 p-4 rounded-2xl flex justify-between items-center shadow-sm sticky top-0 z-10 flex-shrink-0">
                <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">AI Analysis Feed</span>
                <span className="text-xs bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-full border border-blue-100/50">
                  {processedDoc.clauses?.length || 0} Clauses Classified
                </span>
              </div>

              {processedDoc.clauses?.map((clause, index) => (
                <ClauseCard 
                  key={clause.id || index} 
                  clause={clause} 
                  idx={index} 
                  isActive={activeClauseId === index}
                  setActive={() => setActiveClauseId(index)}
                />
              ))}
            </div>

          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-400 border-t border-gray-100 pt-4 max-w-7xl w-full mx-auto flex-shrink-0">
        &copy; {new Date().getFullYear()} ContractIntel. Zero logs. Complete PII compliance.
      </footer>
    </div>
  );
}
