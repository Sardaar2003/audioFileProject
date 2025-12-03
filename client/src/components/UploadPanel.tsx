import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMyUploads, uploadFolder, getFilePresignedUrl } from '../api';
import type { PaginatedResponse } from '../api';
import { FilePair, UploadSummary } from '../types';

// Helper function to format bytes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

// Helper function to calculate upload speed
const calculateUploadSpeed = (loaded: number, total: number, startTime: number): string => {
  if (loaded === 0 || startTime === 0) return '';
  const elapsed = (Date.now() - startTime) / 1000; // seconds
  if (elapsed < 1) return 'Starting...';
  const speed = loaded / elapsed; // bytes per second
  const remaining = total - loaded;
  const eta = remaining / speed; // seconds
  if (eta < 1) return 'Finishing...';
  if (eta < 60) return `~${Math.round(eta)}s remaining`;
  return `~${Math.round(eta / 60)}m remaining`;
};

// Helper component for downloading files using presigned URLs
const FileDownloadButton = ({ filePairId, type, label }: { filePairId: string; type: 'audio' | 'text' | 'review'; label: string }) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const response = await getFilePresignedUrl(filePairId, type);
      // Open presigned URL in new tab to trigger download
      window.open(response.data.url, '_blank');
    } catch (error) {
      console.error('Failed to get download URL:', error);
      alert('Failed to generate download link. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button className="btn secondary" onClick={handleDownload} disabled={downloading}>
      {downloading ? 'Loading...' : label}
    </button>
  );
};

const UploadPanel = () => {
  const directoryInputRef = useRef<HTMLInputElement | null>(null);
  const uploadStartTimeRef = useRef<number>(0);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ loaded: 0, total: 0 });
  const [fileCount, setFileCount] = useState(0);

  useEffect(() => {
    if (directoryInputRef.current) {
      directoryInputRef.current.setAttribute('webkitdirectory', 'true');
      directoryInputRef.current.setAttribute('mozdirectory', 'true');
      directoryInputRef.current.setAttribute('directory', 'true');
    }
  }, []);

  const uploadsQuery = useQuery<PaginatedResponse<FilePair>>({
    queryKey: ['myUploads', status, search, page],
    queryFn: async () => {
      const response = await fetchMyUploads({ status, search, page });
      return response.data;
    },
  });

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

    // Calculate total file size and count
    const totalSize = Array.from(files).reduce((sum, file) => sum + file.size, 0);
    const fileCount = files.length;
    setFileCount(fileCount);

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('files', file));

    try {
      setUploading(true);
      uploadStartTimeRef.current = Date.now();
      setUploadProgress({ loaded: 0, total: totalSize });

      const response = await uploadFolder(formData, (progressEvent) => {
        setUploadProgress({
          loaded: progressEvent.loaded,
          total: progressEvent.total || totalSize,
        });
      });

      setSummary(response.data.summary);
      setDuplicates(response.data.duplicatesSkipped);
      uploadsQuery.refetch();

      // Reset progress after a short delay
      setTimeout(() => {
        setUploadProgress({ loaded: 0, total: 0 });
        setFileCount(0);
        uploadStartTimeRef.current = 0;
      }, 2000);
    } catch (error) {
      console.error(error);
      setUploadProgress({ loaded: 0, total: 0 });
      setFileCount(0);
      uploadStartTimeRef.current = 0;
    } finally {
      setUploading(false);
      if (directoryInputRef.current) {
        directoryInputRef.current.value = '';
      }
    }
  };

  const tableRows = useMemo(() => uploadsQuery.data?.data ?? [], [uploadsQuery.data]);
  const pagination = uploadsQuery.data?.pagination;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ margin: 0 }}>Bulk Audio/Text Upload</h2>
        <p style={{ color: 'var(--muted)' }}>Drop a folder that contains mp3/txt pairs. Invalid pairs are ignored automatically.</p>
      </div>
      <label className="btn" style={{ width: 'fit-content' }}>
        <input
          ref={directoryInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleUpload}
          disabled={uploading}
        />
        {uploading ? 'Uploading...' : 'Select Folder'}
      </label>

      {/* Upload Progress Bar */}
      {uploading && uploadProgress.total > 0 && (
        <div className="card" style={{ background: 'rgba(2,6,23,0.6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
              Uploading {fileCount} file{fileCount !== 1 ? 's' : ''}...
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
              {Math.round((uploadProgress.loaded / uploadProgress.total) * 100)}%
            </span>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{
                width: `${(uploadProgress.loaded / uploadProgress.total) * 100}%`,
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            <span>
              {formatBytes(uploadProgress.loaded)} / {formatBytes(uploadProgress.total)}
            </span>
            <span>{calculateUploadSpeed(uploadProgress.loaded, uploadProgress.total, uploadStartTimeRef.current)}</span>
          </div>
        </div>
      )}

      {summary && (
        <div className="card-grid">
          <div className="card">
            <p className="panel-title">Valid mapped pairs</p>
            <h3>{summary.validPairs}</h3>
          </div>
          <div className="card">
            <p className="panel-title">Unique filenames</p>
            <h3>{summary.uniqueFilenames}</h3>
          </div>
          <div className="card">
            <p className="panel-title">Completed uploads</p>
            <h3>{summary.completedUploads}</h3>
          </div>
        </div>
      )}
      {duplicates.length > 0 && (
        <div className="card" style={{ borderColor: '#f97316' }}>
          <strong>Skipped duplicates:</strong> {duplicates.join(', ')}
        </div>
      )}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <input className="input" placeholder="Search filename..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Processing">Processing</option>
          <option value="Completed">Completed</option>
        </select>
      </div>
      <div className="card" style={{ background: 'rgba(2,6,23,0.35)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((file: FilePair) => (
                <tr key={file._id}>
                  <td>{file.baseName}</td>
                  <td>
                    <span className={`badge ${file.status === 'Completed' ? 'completed' : 'processing'}`}>{file.status}</span>
                  </td>
                  <td>{new Date(file.uploadedAt).toLocaleString()}</td>
                  <td>
                    <FileDownloadButton filePairId={file._id} type="text" label="Text" />
                  </td>
                </tr>
              ))}
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {uploadsQuery.isFetching ? 'Loading...' : 'No uploads yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pagination && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
            <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              className="btn secondary"
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadPanel;


