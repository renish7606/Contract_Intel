import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, FileText, ArrowRight, Clock, AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import UploadPanel from '../components/UploadPanel.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import api from '../api.js';

const RISK_BADGE = {
  HIGH: 'bg-red-100 text-red-700 border-red-200',
  MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  LOW: 'bg-green-100 text-green-700 border-green-200',
};

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  // Fetch recent analyses
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await api.get('/api/contracts/');
        setHistory(response.data);
      } catch (err) {
        console.error('Failed to fetch history:', err);
      } finally {
        setHistoryLoading(false);
      }
    };
    if (isAuthenticated) fetchHistory();
  }, [isAuthenticated]);

  const handleUpload = useCallback(async (file) => {
    setUploading(true);
    setLoadingStep('Reading and scrubbing document...');
    setLoadingProgress(20);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoadingStep('Running local ML classifier...');
      setLoadingProgress(45);
      await new Promise((r) => setTimeout(r, 400));

      setLoadingStep('Sending to AI for plain-English summaries & risk scoring...');
      setLoadingProgress(70);

      const response = await api.post('/api/contracts/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setLoadingStep('Rendering results...');
      setLoadingProgress(95);
      await new Promise((r) => setTimeout(r, 200));

      // Navigate to result page with data
      navigate('/result', { state: { analysisData: response.data } });
    } catch (err) {
      const errorMessage =
        err.response?.data?.error ||
        (err.response?.status === 401
          ? 'Your session expired. Please sign in again.'
          : 'Upload failed. Please try again.');
      alert(errorMessage);
      console.error(err);
    } finally {
      setUploading(false);
      setLoadingStep('');
      setLoadingProgress(0);
    }
  }, [navigate]);

  const getRiskLabel = (doc) => {
    if (doc.risk_score) return doc.risk_score;
    const score = doc.overall_risk_score || 0;
    if (score >= 60) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  };

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back{user?.first_name ? `, ${user.first_name}` : ''}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Upload a new contract or review past analyses.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-full text-xs font-medium text-blue-700 border border-blue-100">
            <Sparkles className="w-3.5 h-3.5" />
            AI-Powered Analysis
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-8">
          {/* Left: Upload Panel */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-5 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full" />
              <h2 className="text-sm font-bold text-gray-900">New Analysis</h2>
            </div>
            <ErrorBoundary fallbackMessage="Upload panel encountered an error.">
              <UploadPanel
                onUploadComplete={handleUpload}
                loading={uploading}
                loadingStep={loadingStep}
                loadingProgress={loadingProgress}
              />
            </ErrorBoundary>
          </div>

          {/* Right: Recent Analyses */}
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-gradient-to-b from-purple-500 to-pink-600 rounded-full" />
                <h2 className="text-sm font-bold text-gray-900">Recent Analyses</h2>
              </div>
              {history.length > 0 && (
                <span className="text-xs text-gray-400 font-medium">{history.length} total</span>
              )}
            </div>

            {historyLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-6 h-6 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">
                  No analyses yet
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Upload your first contract to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {history.map((doc) => {
                  const risk = getRiskLabel(doc);
                  return (
                    <button
                      key={doc.id}
                      onClick={() => navigate('/result', { state: { analysisData: doc } })}
                      className="w-full bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4 hover:border-blue-200 hover:shadow-md transition-all duration-200 text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 transition-colors">
                        <FileText className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {doc.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="flex items-center gap-1 text-[11px] text-gray-400">
                            <Clock className="w-3 h-3" />
                            {formatDate(doc.created_at)}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${RISK_BADGE[risk] || RISK_BADGE.LOW}`}>
                            {risk} Risk
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
