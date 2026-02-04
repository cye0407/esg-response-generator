import { useCallback, useState, useRef } from 'react';
import { UploadSimple, File, X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number;
  className?: string;
  label?: string;
  hint?: string;
}

export function FileUpload({
  onFileSelect,
  accept = '.xlsx,.xls,.csv',
  maxSize = 10,
  className,
  label,
  hint,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File): boolean => {
      setError(null);
      const acceptedTypes = accept.split(',').map((t) => t.trim().toLowerCase());
      const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
      if (!acceptedTypes.includes(fileExtension)) {
        setError(`Invalid file type. Accepted: ${accept}`);
        return false;
      }
      if (file.size / (1024 * 1024) > maxSize) {
        setError(`File too large. Maximum size: ${maxSize}MB`);
        return false;
      }
      return true;
    },
    [accept, maxSize]
  );

  const handleFile = useCallback(
    (file: File) => {
      if (validateFile(file)) {
        setSelectedFile(file);
        onFileSelect(file);
      }
    },
    [validateFile, onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleRemove = () => {
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
      <input ref={inputRef} type="file" accept={accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />

      {selectedFile ? (
        <div className="border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
            <File className="w-5 h-5 text-primary" weight="duotone" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
            <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
          </div>
          <button onClick={handleRemove} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" weight="bold" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
            isDragging ? 'border-primary bg-primary-100' : 'border-gray-300 hover:border-primary hover:bg-primary-100'
          )}
        >
          <UploadSimple className={cn('w-12 h-12 mx-auto mb-4', isDragging ? 'text-primary' : 'text-gray-300')} weight="duotone" />
          <p className="text-sm text-gray-600 mb-1">
            <span className="font-medium text-primary">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-400">{hint || `Supported: ${accept.replace(/\./g, '').toUpperCase()}`}</p>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </div>
  );
}
