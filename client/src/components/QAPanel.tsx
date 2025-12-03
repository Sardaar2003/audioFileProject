import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAssignments, fetchTextContent, saveReviewText, submitReview, getFilePresignedUrl } from '../api';
import { Assignment } from '../types';

const STATUS_OPTIONS: Array<'Pending' | 'OK' | 'Issue'> = ['Pending', 'OK', 'Issue'];
const SOLD_OPTIONS: Array<'Sold' | 'Unsold'> = ['Sold', 'Unsold'];

const QAPanel = () => {
  const queryClient = useQueryClient();
  const assignmentsQuery = useQuery({
    queryKey: ['assignments'],
    queryFn: async () => {
      const response = await fetchAssignments();
      return response.data.data;
    },
  });

  const assignments = assignmentsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedAssignment = useMemo(
    () => assignments.find((assignment: Assignment) => assignment._id === selectedId),
    [assignments, selectedId]
  );

  useEffect(() => {
    if (!selectedAssignment && assignments.length > 0) {
      setSelectedId(assignments[0]._id);
    }
  }, [assignments, selectedAssignment]);

  const textQuery = useQuery({
    queryKey: ['text', selectedAssignment?._id],
    queryFn: async () => {
      if (!selectedAssignment) return null;
      const response = await fetchTextContent(selectedAssignment.filePair._id);
      return response.data;
    },
    enabled: !!selectedAssignment,
  });

  // Get presigned URL for audio streaming
  const audioUrlQuery = useQuery({
    queryKey: ['audioUrl', selectedAssignment?.filePair._id],
    queryFn: async () => {
      if (!selectedAssignment) return null;
      const response = await getFilePresignedUrl(selectedAssignment.filePair._id, 'audio');
      return response.data.url;
    },
    enabled: !!selectedAssignment,
    staleTime: 3600000, // Cache for 1 hour (URL expires in 1 hour)
  });

  // Get presigned URL for text download
  const textUrlQuery = useQuery({
    queryKey: ['textUrl', selectedAssignment?.filePair._id],
    queryFn: async () => {
      if (!selectedAssignment) return null;
      const response = await getFilePresignedUrl(selectedAssignment.filePair._id, 'text');
      return response.data.url;
    },
    enabled: !!selectedAssignment,
    staleTime: 3600000, // Cache for 1 hour
  });

  const [soldStatus, setSoldStatus] = useState<'Sold' | 'Unsold'>('Sold');
  const [reviewStatus, setReviewStatus] = useState<'Pending' | 'OK' | 'Issue'>('Pending');
  const [comment, setComment] = useState('');
  const [editorText, setEditorText] = useState('');
  const [notification, setNotification] = useState('');

  useEffect(() => {
    if (textQuery.data) {
      setEditorText(textQuery.data.reviewContent || '');
    }
  }, [textQuery.data]);

  const saveTextMutation = useMutation({
    mutationFn: (content: string) => saveReviewText(selectedAssignment!.filePair._id, content),
    onSuccess: () => setNotification('Draft saved to filename.F.txt'),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      submitReview({
        assignmentId: selectedAssignment!._id,
        soldStatus,
        reviewStatus,
        comment,
      }),
    onSuccess: () => {
      setNotification('Review submitted');
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });

  const handleSaveText = () => {
    if (!selectedAssignment) return;
    saveTextMutation.mutate(editorText);
  };

  const handleSubmit = () => {
    if (!selectedAssignment) return;
    submitMutation.mutate();
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ margin: 0 }}>QA Review Queue</h2>
        <p style={{ color: 'var(--muted)' }}>Only files assigned to you are visible and actionable.</p>
      </div>
      <div className="card-grid">
        <div className="card">
          <p className="panel-title">Assignments</p>
          <h3>{assignments.length}</h3>
        </div>
        <div className="card">
          <p className="panel-title">Active selection</p>
          <h3>{selectedAssignment?.filePair.baseName ?? 'None'}</h3>
        </div>
      </div>
      <div className="card" style={{ background: 'rgba(2,6,23,0.35)' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {assignments.map((assignment) => (
            <button
              key={assignment._id}
              className={`nav-link ${assignment._id === selectedId ? 'active' : ''}`}
              onClick={() => setSelectedId(assignment._id)}
            >
              {assignment.filePair.baseName}
            </button>
          ))}
          {assignments.length === 0 && <p style={{ color: 'var(--muted)' }}>No assignments yet.</p>}
        </div>
      </div>
      {selectedAssignment && (
        <>
          <div className="card" style={{ background: 'rgba(2,6,23,0.6)' }}>
            <h3 style={{ marginTop: 0 }}>Playback & Reference</h3>
            {audioUrlQuery.isLoading ? (
              <p style={{ color: 'var(--muted)' }}>Loading audio...</p>
            ) : audioUrlQuery.data ? (
              <audio className="audio-player" controls src={audioUrlQuery.data}>
                Your browser does not support the audio element.
              </audio>
            ) : (
              <p style={{ color: '#f87171' }}>Failed to load audio</p>
            )}
            <div style={{ marginTop: '1rem' }}>
              <p className="panel-title">Original transcript</p>
              <div className="text-viewer">{textQuery.isLoading ? 'Loading text...' : textQuery.data?.textContent}</div>
            </div>
            {textUrlQuery.isLoading ? (
              <button className="btn secondary" style={{ marginTop: '1rem' }} disabled>
                Loading download link...
              </button>
            ) : textUrlQuery.data ? (
              <a
                className="btn secondary"
                style={{ marginTop: '1rem' }}
                href={textUrlQuery.data}
                target="_blank"
                rel="noreferrer"
                download
              >
                Download filename.txt
              </a>
            ) : (
              <p style={{ color: '#f87171', marginTop: '1rem' }}>Failed to generate download link</p>
            )}
          </div>
          <div className="card" style={{ background: 'rgba(2,6,23,0.6)' }}>
            <h3 style={{ marginTop: 0 }}>filename.F.txt Editor</h3>
            <textarea className="textarea" value={editorText} onChange={(e) => setEditorText(e.target.value)} placeholder="Edit QA friendly transcript here..." />
            <button className="btn secondary" style={{ alignSelf: 'flex-start', marginTop: '0.75rem' }} onClick={handleSaveText} disabled={saveTextMutation.isPending}>
              {saveTextMutation.isPending ? 'Saving...' : 'Save Draft'}
            </button>
          </div>
          <div className="card" style={{ background: 'rgba(2,6,23,0.6)' }}>
            <h3 style={{ marginTop: 0 }}>Review Outcome</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div>
                <label>Sold / Unsold</label>
                <select className="select" value={soldStatus} onChange={(e) => setSoldStatus(e.target.value as 'Sold' | 'Unsold')}>
                  {SOLD_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Status</label>
                <select className="select" value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value as typeof reviewStatus)}>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label style={{ marginTop: '1rem', display: 'block' }}>Comment</label>
            <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add QA notes for the QA Manager..." />
            <button className="btn" style={{ marginTop: '1rem', alignSelf: 'flex-start' }} onClick={handleSubmit} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? 'Submitting...' : 'Submit Review'}
            </button>
            {notification && <p style={{ color: 'var(--muted)' }}>{notification}</p>}
          </div>
        </>
      )}
    </div>
  );
};

export default QAPanel;


