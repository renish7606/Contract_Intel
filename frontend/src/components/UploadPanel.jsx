import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, AlertCircle } from 'lucide-react';

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
};
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default function UploadPanel({ onUploadComplete, loading, loadingStep, loadingProgress }) {
  const [error, setError] = useState('');

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    setError('');

    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      const errorCode = rejection.errors[0]?.code;
      if (errorCode === 'file-too-large') {
        setError('File too large. Please upload a document under 10MB.');
      } else if (errorCode === 'file-invalid-type') {
        setError('Unsupported file type. Please upload a PDF, DOCX, or TXT file.');
      } else {
        setError('Invalid file. Please try again.');
      }
      return;
    }

    if (acceptedFiles.length > 0) {
      onUploadComplete(acceptedFiles[0]);
    }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    maxFiles: 1,
    disabled: loading,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center
          transition-all duration-300 cursor-pointer min-h-[280px]
          ${loading
            ? 'border-blue-300 bg-blue-50/50 cursor-wait'
            : isDragActive
              ? 'border-blue-500 bg-blue-50 scale-[1.02] shadow-lg'
              : 'border-gray-200 bg-white hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5'
          }
        `}
      >
        <input {...getInputProps()} />

        {loading ? (
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="w-10 h-10 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-gray-700 text-center">
              {loadingStep || 'Processing...'}
            </p>
            <div className="w-full max-w-xs bg-gray-100 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${loadingProgress || 0}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className={`p-4 rounded-2xl mb-4 transition-colors ${isDragActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
              {isDragActive ? (
                <FileText className="w-8 h-8 text-blue-600 animate-bounce" />
              ) : (
                <Upload className="w-8 h-8" />
              )}
            </div>
            <span className="text-sm font-semibold text-gray-700 mb-1">
              {isDragActive ? 'Drop your contract here' : 'Drag & drop or click to browse'}
            </span>
            <span className="text-xs text-gray-400">PDF, DOCX, or TXT — Max 10MB</span>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
